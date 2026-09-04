"""SQLite 持久化层（标准库 sqlite3，零额外依赖）。

每个操作独立短连接，适配本地单进程服务。列表字段以 JSON 存储。
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import DB_PATH, DATA_DIR


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _loads(raw: str | None, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_root_id TEXT,
    sha256 TEXT,
    title TEXT,
    mime_type TEXT,
    modified_at TEXT,
    text TEXT,
    summary TEXT,
    embedding_json TEXT,
    parse_status TEXT
);
CREATE TABLE IF NOT EXISTS placements (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    primary_building_id TEXT,
    secondary_building_ids_json TEXT,
    topic_ids_json TEXT,
    confidence REAL,
    margin REAL,
    reason TEXT,
    evidence_json TEXT,
    state TEXT,
    model_version TEXT,
    confirmed_by TEXT,
    confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    embedding_json TEXT,
    is_discovered INTEGER DEFAULT 0,
    asset TEXT,
    position_json TEXT
);
CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    keywords_json TEXT,
    building_id TEXT,
    state TEXT,
    representative_json TEXT,
    nearest_json TEXT
);
CREATE TABLE IF NOT EXISTS genesis_candidates (
    candidate_id TEXT PRIMARY KEY,
    topic_id TEXT,
    proposed_name TEXT,
    proposed_description TEXT,
    representative_json TEXT,
    evidence_json TEXT,
    keywords_json TEXT,
    nearest_json TEXT,
    novelty_score REAL,
    cohesion_score REAL,
    suggested_scene_type TEXT,
    suggested_visual_brief TEXT,
    state TEXT,
    classifier_version TEXT
);
CREATE TABLE IF NOT EXISTS genesis_jobs (
    job_id TEXT PRIMARY KEY,
    candidate_id TEXT,
    state TEXT,
    result_json TEXT,
    idempotency_key TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    authorized_at TEXT,
    last_scan_at TEXT
);
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    state TEXT,
    progress INTEGER DEFAULT 0,
    error TEXT
);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """给旧库补齐后加的列（CREATE TABLE IF NOT EXISTS 不会改已有表）。"""
    for table, column, ddl in [
        ("buildings", "asset", "ALTER TABLE buildings ADD COLUMN asset TEXT"),
        ("buildings", "position_json", "ALTER TABLE buildings ADD COLUMN position_json TEXT"),
    ]:
        cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in cols:
            conn.execute(ddl)


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── documents ─────────────────────────────────────────────

def upsert_document(doc: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO documents
               (id, source_path, source_root_id, sha256, title, mime_type, modified_at,
                text, summary, embedding_json, parse_status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                doc["id"], doc["source_path"], doc["source_root_id"], doc["sha256"],
                doc["title"], doc["mime_type"], doc["modified_at"], doc["text"],
                doc["summary"], _json(doc.get("embedding", [])), doc["parse_status"],
            ),
        )


def get_document(document_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["embedding"] = _loads(d.pop("embedding_json"), [])
    return d


def list_documents() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM documents ORDER BY title").fetchall()
    out = []
    for row in rows:
        d = dict(row)
        d["embedding"] = _loads(d.pop("embedding_json"), [])
        out.append(d)
    return out


def get_document_by_sha256(sha256: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE sha256 = ?", (sha256,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["embedding"] = _loads(d.pop("embedding_json"), [])
    return d


# ── placements ────────────────────────────────────────────

def upsert_placement(p: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO placements
               (id, document_id, primary_building_id, secondary_building_ids_json, topic_ids_json,
                confidence, margin, reason, evidence_json, state, model_version, confirmed_by, confirmed_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p["id"], p["document_id"], p["primary_building_id"],
                _json(p.get("secondary_building_ids", [])), _json(p.get("topic_ids", [])),
                p.get("confidence", 0.0), p.get("margin", 0.0), p.get("reason", ""),
                _json(p.get("evidence_chunk_ids", [])), p["state"], p.get("model_version", ""),
                p.get("confirmed_by"), p.get("confirmed_at"),
            ),
        )


def get_placement(placement_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM placements WHERE id = ?", (placement_id,)).fetchone()
    return _placement_from_row(row)


def get_placement_by_document(document_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM placements WHERE document_id = ?", (document_id,)
        ).fetchone()
    return _placement_from_row(row)


def list_placements(state: str | None = None) -> list[dict[str, Any]]:
    with _connect() as conn:
        if state:
            rows = conn.execute(
                "SELECT * FROM placements WHERE state = ?", (state,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM placements").fetchall()
    return [p for p in (_placement_from_row(r) for r in rows) if p is not None]


def _placement_from_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    d = dict(row)
    d["secondary_building_ids"] = _loads(d.pop("secondary_building_ids_json"), [])
    d["topic_ids"] = _loads(d.pop("topic_ids_json"), [])
    d["evidence_chunk_ids"] = _loads(d.pop("evidence_json"), [])
    return d


# ── buildings ─────────────────────────────────────────────

def upsert_building(b: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO buildings (id, name, description, embedding_json, is_discovered, asset, position_json)
               VALUES (?,?,?,?,?,?,?)""",
            (b["id"], b["name"], b["description"], _json(b.get("embedding", [])),
             1 if b.get("is_discovered") else 0,
             b.get("asset"), _json(b.get("position") if b.get("position") is not None else None)),
        )


def _building_from_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["embedding"] = _loads(d.pop("embedding_json"), [])
    d["is_discovered"] = bool(d["is_discovered"])
    d["position"] = _loads(d.pop("position_json"), None)
    return d


def get_building(building_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM buildings WHERE id = ?", (building_id,)).fetchone()
    return _building_from_row(row) if row else None


def list_buildings() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM buildings").fetchall()
    return [_building_from_row(row) for row in rows]


# ── topics ────────────────────────────────────────────────

def upsert_topic(t: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO topics
               (id, name, description, keywords_json, building_id, state, representative_json, nearest_json)
               VALUES (?,?,?,?,?,?,?,?)""",
            (t["id"], t["name"], t.get("description", ""), _json(t.get("keywords", [])),
             t.get("building_id"), t.get("state", "proposed"),
             _json(t.get("representative_document_ids", [])), _json(t.get("nearest_building_ids", []))),
        )


def list_topics() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM topics").fetchall()
    out = []
    for row in rows:
        d = dict(row)
        d["keywords"] = _loads(d.pop("keywords_json"), [])
        d["representative_document_ids"] = _loads(d.pop("representative_json"), [])
        d["nearest_building_ids"] = _loads(d.pop("nearest_json"), [])
        out.append(d)
    return out


# ── genesis candidates / jobs ─────────────────────────────

def upsert_candidate(c: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO genesis_candidates
               (candidate_id, topic_id, proposed_name, proposed_description, representative_json,
                evidence_json, keywords_json, nearest_json, novelty_score, cohesion_score,
                suggested_scene_type, suggested_visual_brief, state, classifier_version)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (c["candidate_id"], c["topic_id"], c["proposed_name"], c.get("proposed_description", ""),
             _json(c.get("representative_document_ids", [])), _json(c.get("evidence_chunk_ids", [])),
             _json(c.get("keywords", [])), _json(c.get("nearest_building_ids", [])),
             c.get("novelty_score", 0.0), c.get("cohesion_score", 0.0),
             c.get("suggested_scene_type"), c.get("suggested_visual_brief"),
             c.get("state", "proposed"), c.get("classifier_version", "")),
        )


def get_candidate(candidate_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM genesis_candidates WHERE candidate_id = ?", (candidate_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["representative_document_ids"] = _loads(d.pop("representative_json"), [])
    d["evidence_chunk_ids"] = _loads(d.pop("evidence_json"), [])
    d["keywords"] = _loads(d.pop("keywords_json"), [])
    d["nearest_building_ids"] = _loads(d.pop("nearest_json"), [])
    return d


def list_candidates() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM genesis_candidates").fetchall()
    out = []
    for row in rows:
        d = dict(row)
        d["representative_document_ids"] = _loads(d.pop("representative_json"), [])
        d["evidence_chunk_ids"] = _loads(d.pop("evidence_json"), [])
        d["keywords"] = _loads(d.pop("keywords_json"), [])
        d["nearest_building_ids"] = _loads(d.pop("nearest_json"), [])
        out.append(d)
    return out


def upsert_job(j: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO genesis_jobs (job_id, candidate_id, state, result_json, idempotency_key, created_at)
               VALUES (?,?,?,?,?,?)""",
            (j["job_id"], j["candidate_id"], j["state"], _json(j.get("result", {})),
             j.get("idempotency_key", ""), j.get("created_at", "")),
        )


def get_job(job_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM genesis_jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["result"] = _loads(d.pop("result_json"), {})
    return d


def list_genesis_jobs() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM genesis_jobs").fetchall()
    out = []
    for row in rows:
        d = dict(row)
        d["result"] = _loads(d.pop("result_json"), {})
        out.append(d)
    return out


# ── sources / ingestion jobs ──────────────────────────────

def upsert_source(s: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sources (id, path, authorized_at, last_scan_at) VALUES (?,?,?,?)",
            (s["id"], s["path"], s.get("authorized_at"), s.get("last_scan_at")),
        )


def get_source(source_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
    return dict(row) if row else None


def list_sources() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM sources").fetchall()
    return [dict(r) for r in rows]


def upsert_ingestion(j: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO ingestion_jobs (id, source_id, state, progress, error) VALUES (?,?,?,?,?)",
            (j["id"], j["source_id"], j["state"], j.get("progress", 0), j.get("error")),
        )


def get_ingestion(job_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM ingestion_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None
