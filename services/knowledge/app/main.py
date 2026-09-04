"""services/knowledge FastAPI 入口。

API 契约对应设计文档 6.1（分类 API）+ 6.2（building-genesis 端口）。
"""
from __future__ import annotations

import time
import uuid
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import building_genesis, db, ingest
from .classifier import ensure_buildings_seeded
from .config import CORS_ORIGINS, MAX_UPLOAD_BYTES

app = FastAPI(title="services/knowledge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    ensure_buildings_seeded()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@app.get("/health")
def health():
    return {"ok": True, "service": "deepspace-knowledge"}


# ── 请求体 ────────────────────────────────────────────────

class SelectFolderBody(BaseModel):
    path: str


class ConfirmBody(BaseModel):
    pass


class CorrectBody(BaseModel):
    primary_building_id: str | None = None
    secondary_building_ids: list[str] = []


class BuildBody(BaseModel):
    idempotency_key: str = ""


class AutoMaterializeBody(BaseModel):
    idempotency_key: str = ""
    document_ids: list[str] = []


@app.post("/api/files/upload")
async def upload_file(
    request: Request,
    x_file_name: str = Header(default="unnamed-file"),
    x_file_type: str = Header(default="application/octet-stream"),
):
    """Accept one raw file body. The web client repeats this call for multi-select."""
    filename = unquote(x_file_name)
    buffer = bytearray()
    async for chunk in request.stream():
        buffer.extend(chunk)
        if len(buffer) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{filename} 超过 128 MB 单文件上限")
    data = bytes(buffer)
    try:
        result = ingest.ingest_uploaded_file(filename=filename, data=data, content_type=x_file_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    building = db.get_building(result["building_id"]) if result["building_id"] else None
    return {**result, "building_name": building["name"] if building else None}


# ── 分类 API（md 6.1）─────────────────────────────────────

@app.post("/api/sources/folders/select")
def select_folder(body: SelectFolderBody):
    try:
        return ingest.select_source(body.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/sources/{source_id}/scan")
def scan_source(source_id: str):
    try:
        return ingest.run_ingestion(source_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/ingestion/jobs/{job_id}")
def get_ingestion(job_id: str):
    job = db.get_ingestion(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.get("/api/placements/inbox")
def placements_inbox():
    """待确认分类建议（proposed + needs_review）。"""
    items = db.list_placements()
    inbox = [p for p in items if p["state"] in ("proposed", "needs_review")]
    return {"items": inbox, "total": len(inbox)}


@app.post("/api/placements/{placement_id}/confirm")
def confirm_placement(placement_id: str):
    p = db.get_placement(placement_id)
    if not p:
        raise HTTPException(status_code=404, detail="placement not found")
    p["state"] = "confirmed"
    p["confirmed_by"] = "user"
    p["confirmed_at"] = _now()
    db.upsert_placement(p)
    return p


@app.post("/api/placements/{placement_id}/correct")
def correct_placement(placement_id: str, body: CorrectBody):
    p = db.get_placement(placement_id)
    if not p:
        raise HTTPException(status_code=404, detail="placement not found")
    if body.primary_building_id is not None:
        p["primary_building_id"] = body.primary_building_id
    if body.secondary_building_ids:
        p["secondary_building_ids"] = body.secondary_building_ids
    p["state"] = "confirmed"
    p["confirmed_by"] = "user"
    p["confirmed_at"] = _now()
    db.upsert_placement(p)
    return p


@app.post("/api/placements/{placement_id}/reject")
def reject_placement(placement_id: str):
    p = db.get_placement(placement_id)
    if not p:
        raise HTTPException(status_code=404, detail="placement not found")
    p["state"] = "rejected"
    p["confirmed_by"] = "user"
    p["confirmed_at"] = _now()
    db.upsert_placement(p)
    return p


@app.get("/api/buildings")
def list_buildings():
    return {"items": [b for b in db.list_buildings()]}


@app.get("/api/buildings/{building_id}/documents")
def building_documents(building_id: str):
    docs = []
    for p in db.list_placements(state="confirmed"):
        if p["primary_building_id"] == building_id or building_id in p["secondary_building_ids"]:
            d = db.get_document(p["document_id"])
            if d:
                # 保留 text（前端渲染正文需要），去掉历史兼容字段
                d.pop("embedding", None)
                docs.append({**d, "placement": p})
    docs.sort(key=lambda x: x["title"])
    return {"items": docs, "total": len(docs)}


# ── 新主题发现（md 6.1 topics）────────────────────────────

@app.get("/api/topics/discovered")
def discovered_topics():
    return {"items": db.list_topics()}


@app.post("/api/topics/{topic_id}/materialize")
def materialize_topic(topic_id: str):
    topic = next((t for t in db.list_topics() if t["id"] == topic_id), None)
    if not topic:
        raise HTTPException(status_code=404, detail="topic not found")
    candidate = next(
        (c for c in db.list_candidates() if c["topic_id"] == topic_id), None
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="candidate not found")
    building_genesis.confirm(candidate["candidate_id"])
    return building_genesis.build(candidate["candidate_id"], idempotency_key=uuid.uuid4().hex)


# ── building-genesis 端口（md 6.2）────────────────────────

@app.post("/api/building-genesis/candidates")
def discover_candidates():
    return {"items": building_genesis.discover_candidates()}


@app.post("/api/building-genesis/auto-materialize")
def auto_materialize(body: AutoMaterializeBody):
    """上传动作的候选聚合→生成编排入口；立即返回异步 job，由前端轮询。"""
    key = body.idempotency_key or uuid.uuid4().hex
    return building_genesis.auto_materialize(key, body.document_ids)


@app.get("/api/building-genesis/candidates/{candidate_id}/preview")
def candidate_preview(candidate_id: str):
    c = building_genesis.preview(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="candidate not found")
    return c


@app.post("/api/building-genesis/candidates/{candidate_id}/confirm")
def candidate_confirm(candidate_id: str):
    c = building_genesis.confirm(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="candidate not found")
    return c


@app.post("/api/building-genesis/candidates/{candidate_id}/build")
def candidate_build(candidate_id: str, body: BuildBody):
    try:
        return building_genesis.build(candidate_id, body.idempotency_key or uuid.uuid4().hex)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.get("/api/building-genesis/jobs/{job_id}")
def genesis_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.post("/api/building-genesis/jobs/{job_id}/cancel")
def genesis_job_cancel(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job["state"] in ("pending", "running"):
        job["state"] = "cancelled"
        db.upsert_job(job)
    return job
