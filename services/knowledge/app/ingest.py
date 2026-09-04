"""摄入编排：扫描 → 解析 → 去重 → 过滤 → 关键词 mock 分类 → 落库。"""
from __future__ import annotations

import hashlib
import mimetypes
import re
import time
import uuid
from pathlib import Path
from typing import Any

from . import db
from .classifier import classify, ensure_buildings_seeded
from .config import ALLOWED_SOURCE_ROOTS, MIN_TEXT_LENGTH, UPLOAD_DIR
from .parser import parse_text, parse_upload_bytes
from .scanner import scan_files


def select_source(path: str) -> dict[str, Any]:
    """选择并授权一个本地目录（只读）。返回 source 记录。"""
    p = Path(path).resolve()
    if not p.exists() or not p.is_dir():
        raise ValueError(f"目录不存在或不是目录：{p}")
    if not any(p == root or p.is_relative_to(root) for root in ALLOWED_SOURCE_ROOTS):
        roots = "、".join(str(root) for root in ALLOWED_SOURCE_ROOTS)
        raise ValueError(f"目录不在允许范围内。请通过 LKS_ALLOWED_ROOTS 授权：{roots}")
    source_id = f"src-{uuid.uuid4().hex[:10]}"
    source = {
        "id": source_id,
        "path": str(p),
        "authorized_at": _now(),
        "last_scan_at": None,
    }
    db.upsert_source(source)
    return source


def run_ingestion(source_id: str) -> dict[str, Any]:
    """对已授权目录执行一次完整扫描与分类。同步执行，但记录 job 进度。

    返回 job 记录（state=done/failed + 统计信息）。
    """
    source = db.get_source(source_id)
    if not source:
        raise KeyError(f"unknown source {source_id}")

    job_id = f"ingest-{uuid.uuid4().hex[:10]}"
    db.upsert_ingestion({"id": job_id, "source_id": source_id, "state": "running", "progress": 0})

    try:
        ensure_buildings_seeded()
        root = Path(source["path"])
        files = scan_files(root)
        total = len(files)

        seen_sha: set[str] = set()
        new_count = 0
        dup_count = 0
        skip_count = 0
        fail_count = 0

        batch: list[tuple[str, dict]] = []  # (document_id, parsed)

        for i, finfo in enumerate(files):
            sha = finfo["sha256"]
            # 去重：同 sha 已存在则跳过（保留多来源引用见 md 11 验收，首版记录但只存一个实体）
            if sha in seen_sha:
                dup_count += 1
                continue
            seen_sha.add(sha)

            existing = db.get_document_by_sha256(sha)
            if existing:
                dup_count += 1
                continue

            path = Path(finfo["path"])
            try:
                raw = path.read_text(encoding="utf-8", errors="replace")
                parsed = parse_text(path, raw)
            except OSError:
                fail_count += 1
                continue

            if len(parsed["text"].strip()) < MIN_TEXT_LENGTH:
                skip_count += 1  # 空白/低信息文件
                continue

            doc_id = f"doc-{uuid.uuid4().hex[:10]}"
            parsed["id"] = doc_id
            parsed["source_path"] = str(path)
            parsed["source_root_id"] = source_id
            parsed["sha256"] = sha
            parsed["mime_type"] = "text/markdown" if path.suffix.lower() == ".md" else "text/plain"
            parsed["modified_at"] = str(finfo["modified_at"])
            parsed["parse_status"] = "ready"
            batch.append((doc_id, parsed))
            new_count += 1

            db.upsert_ingestion({
                "id": job_id, "source_id": source_id, "state": "running",
                "progress": int((i + 1) / max(total, 1) * 50),
            })

        # 轻量关键词 mock 分类
        if batch:
            for doc_id, d in batch:
                d["embedding"] = []
                db.upsert_document(d)
                placement = classify(doc_id, f"{d['title']}\n{d['summary']}\n{d['text']}")
                db.upsert_placement(placement)
                db.upsert_ingestion({
                    "id": job_id, "source_id": source_id, "state": "running",
                    "progress": 90,
                })

        db.upsert_source({
            "id": source["id"], "path": source["path"],
            "authorized_at": source["authorized_at"], "last_scan_at": _now(),
        })
        db.upsert_ingestion({
            "id": job_id, "source_id": source_id, "state": "done", "progress": 100,
        })
        return {
            **db.get_ingestion(job_id),
            "stats": {
                "total": total, "new": new_count, "duplicate": dup_count,
                "skipped": skip_count, "failed": fail_count,
            },
        }
    except Exception as exc:  # noqa: BLE001 - 记录失败状态，不让服务崩溃
        db.upsert_ingestion({
            "id": job_id, "source_id": source_id, "state": "failed",
            "progress": 0, "error": str(exc),
        })
        raise


def ingest_uploaded_file(
    filename: str,
    data: bytes,
    content_type: str = "",
    upload_root: Path | None = None,
) -> dict[str, Any]:
    """Archive one browser upload, extract what is safe, and classify it.

    High-confidence suggestions are auto-confirmed and immediately placed. Grey
    or novel items remain in the review inbox. Uploaded bytes are never executed.
    """
    if not data:
        raise ValueError("空文件不能导入")

    digest = hashlib.sha256(data).hexdigest()
    existing = db.get_document_by_sha256(digest)
    if existing:
        previous_placement = db.get_placement_by_document(existing["id"])
        existing_text = f"{existing.get('title', '')}\n{existing.get('summary', '')}\n{existing.get('text', '')}"
        placement = classify(existing["id"], existing_text)
        if previous_placement:
            placement["id"] = previous_placement["id"]
        if placement.get("primary_building_id"):
            placement["state"] = "confirmed"
            placement["confirmed_by"] = "rule"
            placement["confirmed_at"] = _now()
        db.upsert_placement(placement)
        return _upload_result(existing, placement, "duplicate")

    safe_name = _safe_filename(filename)
    root = (upload_root or UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    stored_path = root / f"{uuid.uuid4().hex[:12]}-{safe_name}"
    stored_path.write_bytes(data)

    detected_type = content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    parsed = parse_upload_bytes(Path(safe_name), data, detected_type)
    doc_id = f"doc-{uuid.uuid4().hex[:10]}"
    document = {
        "id": doc_id,
        "source_path": str(stored_path),
        "source_root_id": "drag-drop",
        "sha256": digest,
        "title": parsed["title"],
        "mime_type": detected_type,
        "modified_at": str(time.time()),
        "text": parsed["text"],
        "summary": parsed["summary"],
        "parse_status": parsed["parse_status"],
    }

    ensure_buildings_seeded()
    document["embedding"] = []
    db.upsert_document(document)

    placement = classify(doc_id, f"{document['title']}\n{document['summary']}\n{document['text']}")
    status = "review"
    # 拖放强调“立即入城”：只要分类器给出最近建筑，就先放入；低 margin
    # 仍保留在 reason/confidence 中供后续人工纠正。真正的新主题（primary=None）
    # 才进入待确认池并等待长出新建筑。
    if placement.get("primary_building_id"):
        placement["state"] = "confirmed"
        placement["confirmed_by"] = "rule"
        placement["confirmed_at"] = _now()
        status = "placed"
    db.upsert_placement(placement)
    return _upload_result(document, placement, status)


def _safe_filename(filename: str) -> str:
    leaf = Path(filename.replace("\\", "/")).name.strip()
    leaf = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", leaf)
    if not leaf:
        leaf = "unnamed-file"
    stem = Path(leaf).stem[:96] or "file"
    suffix = Path(leaf).suffix[:20]
    return f"{stem}{suffix}"


def _upload_result(document: dict[str, Any], placement: dict[str, Any] | None, status: str) -> dict[str, Any]:
    return {
        "document_id": document["id"],
        "title": document["title"],
        "mime_type": document["mime_type"],
        "parse_status": document["parse_status"],
        "status": status,
        "building_id": placement.get("primary_building_id") if placement else None,
        "confidence": placement.get("confidence", 0) if placement else 0,
        "reason": placement.get("reason", "") if placement else "",
    }


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
