"""新建筑生长端口（BuildingGenesisPort，设计文档 6.2）。

这是分类服务与 3D 生成服务之间的稳定边界。首版用一个「本地占位生成器」
（把候选直接落成一栋新建筑）实现该端口，未来接 Three.js 参数化生成或外部
3D API 时只替换 generator，不改下游。

硬性规则（md 6.2）：
  - 只有 confirmed 候选才能 build
  - build 幂等：重复调用不产生重复建筑
  - 新建筑先获得稳定 buildingId，再生成场景
  - 3D 失败保留主题/文档/候选
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any

from . import db, generator, llm
from .config import BUILDING_POSITIONS, BUILDING_SEEDS, CATEGORY_PLOTS, GENERATED_ASSET_DIR, UPLOAD_PLOTS_BY_CATEGORY


def discover_candidates() -> list[dict[str, Any]]:
    """从待发现池（primary_building_id 为空的 needs_review 文档）聚合候选主题。

    返回生成的候选列表。少于最小样本量不聚合（md 4.3 降级）。
    """
    from .clustering import cluster_documents

    novel_ids = [
        p["document_id"] for p in db.list_placements(state="needs_review")
        if p["primary_building_id"] is None
    ]
    if not novel_ids:
        return []

    clusters = cluster_documents(novel_ids)
    candidates: list[dict[str, Any]] = []
    for cluster in clusters:
        docs = [db.get_document(did) for did in cluster["doc_ids"]]
        docs = [d for d in docs if d]
        if len(docs) < 3:
            continue  # 太小的簇不单独长建筑，回到待确认箱

        representative_ids = sorted(cluster["doc_ids"])[:6]
        existing = _candidate_for_documents(representative_ids)
        if existing:
            candidates.append(existing)
            continue

        summaries = [f"{d['title']}：{d['summary']}" for d in docs]
        named = llm.name_topic(summaries)
        topic_id = f"topic-{uuid.uuid4().hex[:10]}"
        candidate_id = f"cand-{uuid.uuid4().hex[:10]}"

        candidate = {
            "candidate_id": candidate_id,
            "topic_id": topic_id,
            "proposed_name": named.get("name") or _fallback_name(cluster["keywords"]),
            "proposed_description": named.get("description", ""),
            "representative_document_ids": representative_ids,
            "evidence_chunk_ids": [],
            "keywords": cluster["keywords"],
            "nearest_building_ids": [],
            "novelty_score": round(1.0 - cluster["cohesion"], 4),
            "cohesion_score": cluster["cohesion"],
            "suggested_scene_type": named.get("sceneType"),
            "suggested_visual_brief": named.get("visualBrief"),
            "state": "proposed",
            "classifier_version": "keyword-aggregate-mock-v1",
        }
        db.upsert_candidate(candidate)
        db.upsert_topic({
            "id": topic_id,
            "name": candidate["proposed_name"],
            "description": candidate["proposed_description"],
            "keywords": cluster["keywords"],
            "building_id": None,
            "state": "proposed",
            "representative_document_ids": cluster["doc_ids"],
            "nearest_building_ids": [],
        })
        candidates.append(candidate)
    return candidates


def auto_materialize(idempotency_key: str, document_ids: list[str] | None = None) -> dict[str, Any]:
    """一次用户上传后的编排：聚合新颖文档、确认候选并幂等发起建筑生成。

    这是由明确的“上传”动作触发，而不是后台无界自动扫描。同一次上传使用
    稳定 idempotency key，重试不会重复生成。
    """
    candidates = _upload_candidates(document_ids) if document_ids else discover_candidates()
    jobs: list[dict[str, Any]] = []
    for candidate in candidates:
        current = db.get_candidate(candidate["candidate_id"]) or candidate
        if current["state"] == "proposed":
            current = confirm(current["candidate_id"]) or current
        if current["state"] == "confirmed":
            jobs.append(build(current["candidate_id"], f"{idempotency_key}:{current['candidate_id']}"))
            continue
        if current["state"] in ("materializing", "ready"):
            existing_job = _latest_job_for_candidate(current["candidate_id"])
            if existing_job:
                jobs.append(existing_job)
    return {"candidates": candidates, "jobs": jobs}


def _upload_candidates(document_ids: list[str]) -> list[dict[str, Any]]:
    """把本次上传先按已有分类分组；每个分类生成一栋可落位的记忆建筑。"""
    groups: dict[str, list[str]] = {}
    for document_id in document_ids:
        document = db.get_document(document_id)
        placement = db.get_placement_by_document(document_id)
        if not document or not placement:
            continue
        category_id = placement.get("primary_building_id") or "novel"
        groups.setdefault(category_id, []).append(document_id)

    candidates: list[dict[str, Any]] = []
    for category_id, ids in groups.items():
        representative_ids = sorted(set(ids))[:6]
        existing = _candidate_for_documents(representative_ids)
        if existing:
            candidates.append(existing)
            continue
        documents = [db.get_document(document_id) for document_id in representative_ids]
        documents = [document for document in documents if document]
        category = db.get_building(category_id) if category_id != "novel" else None
        category_name = category["name"] if category else "新知识"
        title = f"{category_name}记忆馆" if category else f"{documents[0]['title'][:10]}馆"
        description = "；".join(document.get("summary") or document["title"] for document in documents)[:360]
        topic_id = f"topic-{uuid.uuid4().hex[:10]}"
        candidate = {
            "candidate_id": f"cand-{uuid.uuid4().hex[:10]}",
            "topic_id": topic_id,
            "proposed_name": title,
            "proposed_description": description,
            "representative_document_ids": representative_ids,
            "evidence_chunk_ids": [],
            "keywords": [category_name],
            "nearest_building_ids": [category_id] if category else [],
            "novelty_score": 0.0 if category else 1.0,
            "cohesion_score": 1.0,
            "suggested_scene_type": "knowledge-building",
            "suggested_visual_brief": "",
            "state": "proposed",
            "classifier_version": "upload-category-v1",
        }
        db.upsert_candidate(candidate)
        db.upsert_topic({
            "id": topic_id, "name": title, "description": description,
            "keywords": [category_name], "building_id": None, "state": "proposed",
            "representative_document_ids": representative_ids,
            "nearest_building_ids": candidate["nearest_building_ids"],
        })
        candidates.append(candidate)
    return candidates


def _fallback_name(keywords: list[str]) -> str:
    if not keywords:
        return "新主题"
    return keywords[0][:4]


def _candidate_for_documents(document_ids: list[str]) -> dict[str, Any] | None:
    signature = tuple(sorted(document_ids))
    for candidate in db.list_candidates():
        if candidate["state"] == "rejected":
            continue
        existing_signature = tuple(sorted(candidate["representative_document_ids"]))
        if existing_signature == signature:
            return candidate
    return None


def preview(candidate_id: str) -> dict[str, Any] | None:
    candidate = db.get_candidate(candidate_id)
    if not candidate:
        return None
    reps = [db.get_document(did) for did in candidate["representative_document_ids"]]
    reps = [d for d in reps if d]
    candidate["representative_documents"] = [
        {"id": d["id"], "title": d["title"], "summary": d["summary"]} for d in reps
    ]
    return candidate


def confirm(candidate_id: str) -> dict[str, Any] | None:
    candidate = db.get_candidate(candidate_id)
    if not candidate:
        return None
    candidate["state"] = "confirmed"
    db.upsert_candidate(candidate)
    topic = _topic_by_id(candidate["topic_id"])
    if topic:
        topic["state"] = "confirmed"
        db.upsert_topic(topic)
    return candidate


def reject(candidate_id: str) -> dict[str, Any] | None:
    candidate = db.get_candidate(candidate_id)
    if not candidate:
        return None
    candidate["state"] = "rejected"
    db.upsert_candidate(candidate)
    topic = _topic_by_id(candidate["topic_id"])
    if topic:
        topic["state"] = "rejected"
        db.upsert_topic(topic)
    return candidate


def build(candidate_id: str, idempotency_key: str) -> dict[str, Any]:
    """幂等地发起新建筑生成。只有 confirmed 候选可 build。

    对接队友的 generation-proxy（文生图 + lux3D 图生 3D），异步执行：
    立即返回 running job，后台线程跑生成链路，完成后把 GLB 落盘、
    落库新建筑（含 asset 路径与外围地块坐标），job 变为 ready。
    """
    candidate = db.get_candidate(candidate_id)
    if not candidate:
        raise KeyError(f"unknown candidate {candidate_id}")

    # 幂等优先：同 candidate + 同 key 已 build 过，直接返回既有 job
    existing = _find_job(candidate_id, idempotency_key)
    if existing:
        return existing
    # 已 ready 的候选（无论 key），返回它已完成的那个 job，避免重复长建筑
    if candidate["state"] == "ready":
        done = _find_job_for_candidate(candidate_id)
        if done:
            return done

    if candidate["state"] != "confirmed":
        raise ValueError(f"candidate {candidate_id} is not confirmed (state={candidate['state']})")

    job_id = f"job-{uuid.uuid4().hex[:10]}"
    building_id = f"building-{candidate['topic_id'].removeprefix('topic-')}"

    job = {
        "job_id": job_id,
        "candidate_id": candidate_id,
        "state": "running",
        "result": {},
        "idempotency_key": idempotency_key,
        "created_at": _now(),
    }
    db.upsert_job(job)

    # 标记候选进入 materializing，防重复触发
    candidate["state"] = "materializing"
    db.upsert_candidate(candidate)

    thread = threading.Thread(
        target=_run_generation,
        args=(candidate_id, job_id, building_id),
        daemon=True,
    )
    thread.start()
    return job


def _build_prompt(candidate: dict[str, Any]) -> str:
    """从候选生成文生图提示词：优先视觉简报，否则用名称+描述。"""
    brief = (candidate.get("suggested_visual_brief") or "").strip()
    if brief:
        return brief
    parts = [candidate.get("proposed_name", "").strip()]
    desc = (candidate.get("proposed_description") or "").strip()
    if desc:
        parts.append(desc)
    prompt = " ".join(p for p in parts if p)
    return prompt or "一栋风格化建筑"


def _allocate_plot(candidate: dict[str, Any]) -> tuple[int, int]:
    """分配一个未被已落库 discovered 建筑占用的外围地块。"""
    taken = set()
    for b in db.list_buildings():
        if b.get("is_discovered") and b.get("position"):
            taken.add((int(b["position"][0]), int(b["position"][2])))
    preferred_id = next(iter(candidate.get("nearest_building_ids") or []), "")
    preferred = BUILDING_POSITIONS.get(preferred_id, (0, 0))
    nearby = UPLOAD_PLOTS_BY_CATEGORY.get(preferred_id or "novel")
    ordered_plots = sorted(CATEGORY_PLOTS, key=lambda plot: (plot[0] - preferred[0]) ** 2 + (plot[1] - preferred[1]) ** 2)
    for plot in ([nearby] if nearby else []) + ordered_plots:
        if plot not in taken:
            return plot
    raise RuntimeError(f"{len(CATEGORY_PLOTS)} 个生长地块已全部被占用")


def _run_generation(candidate_id: str, job_id: str, building_id: str) -> None:
    """后台线程：走文生图 + 图生 3D 生成 GLB，落库新建筑，更新 job。

    任何失败都只把 job 置为 failed，candidate 回退到 confirmed 以便重试，
    不抛异常穿透线程。
    """
    try:
        candidate = db.get_candidate(candidate_id)
        if not candidate:
            raise RuntimeError(f"candidate {candidate_id} 丢失")
        prompt = _build_prompt(candidate)
        category_id = next(iter(candidate.get("nearest_building_ids") or []), "")
        category = BUILDING_SEEDS.get(category_id, {}).get("name", "新知识")

        def on_stage(phase: str, data: dict[str, Any]) -> None:
            _update_job_phase(job_id, phase, data)

        asset_path = generator.generate_building_glb(
            prompt,
            building_id,
            GENERATED_ASSET_DIR,
            category=category,
            summary=candidate.get("proposed_description", ""),
            on_stage=on_stage,
        )
        x, z = _allocate_plot(candidate)
        position = [x, 0, z]

        db.upsert_building({
            "id": building_id,
            "name": candidate["proposed_name"],
            "description": candidate["proposed_description"],
            "embedding": [],
            "is_discovered": True,
            "asset": asset_path,
            "position": position,
        })

        # 把代表文档的 placement 指向新建筑
        for did in candidate["representative_document_ids"]:
            p = db.get_placement_by_document(did)
            if p:
                p["primary_building_id"] = building_id
                p["state"] = "confirmed"
                p["confirmed_by"] = "rule"
                p["confirmed_at"] = _now()
                db.upsert_placement(p)

        job = db.get_job(job_id)
        if job:
            job["state"] = "ready"
            job["result"] = {
                **job.get("result", {}),
                "building_id": building_id,
                "name": candidate["proposed_name"],
                "asset": asset_path,
                "position": position,
                "source_prompt": prompt,
                "phase": "complete",
                "generator": "generation-proxy-v1",
            }
            db.upsert_job(job)

        candidate["state"] = "ready"
        db.upsert_candidate(candidate)
        topic = _topic_by_id(candidate["topic_id"])
        if topic:
            topic["building_id"] = building_id
            topic["state"] = "materialized"
            db.upsert_topic(topic)
    except Exception as exc:  # noqa: BLE001 - 后台线程不能抛异常穿透
        job = db.get_job(job_id)
        if job:
            job["state"] = "failed"
            job["result"] = {
                **job.get("result", {}),
                "phase": "error",
                "error": str(exc),
                "generator": "generation-proxy-v1",
            }
            db.upsert_job(job)
        candidate = db.get_candidate(candidate_id)
        if candidate and candidate["state"] == "materializing":
            candidate["state"] = "confirmed"  # 回退，允许重试
            db.upsert_candidate(candidate)


def _update_job_phase(job_id: str, phase: str, data: dict[str, Any]) -> None:
    job = db.get_job(job_id)
    if not job or job["state"] != "running":
        return
    job["result"] = {**job.get("result", {}), **data, "phase": phase}
    db.upsert_job(job)


def _find_job(candidate_id: str, idempotency_key: str) -> dict[str, Any] | None:
    for j in _list_jobs():
        if j["candidate_id"] == candidate_id and j["idempotency_key"] == idempotency_key:
            return j
    return None


def _find_job_for_candidate(candidate_id: str) -> dict[str, Any] | None:
    jobs = [j for j in _list_jobs() if j["candidate_id"] == candidate_id and j["state"] == "ready"]
    return jobs[0] if jobs else None


def _latest_job_for_candidate(candidate_id: str) -> dict[str, Any] | None:
    jobs = [j for j in _list_jobs() if j["candidate_id"] == candidate_id]
    jobs.sort(key=lambda job: job.get("created_at", ""), reverse=True)
    return jobs[0] if jobs else None


def _list_jobs() -> list[dict[str, Any]]:
    return db.list_genesis_jobs()


def _topic_by_id(topic_id: str) -> dict[str, Any] | None:
    for t in db.list_topics():
        if t["id"] == topic_id:
            return t
    return None


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
