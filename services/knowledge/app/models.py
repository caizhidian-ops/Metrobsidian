"""数据模型：对应设计文档 4.1 / 4.4 / 6.2 的 TS 接口。

使用 dataclass + asdict，避免额外运行时依赖。
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class CanonicalDocument:
    id: str
    source_path: str
    source_root_id: str
    sha256: str
    title: str
    mime_type: str
    modified_at: str
    text: str
    summary: str = ""
    embedding: list[float] = field(default_factory=list)
    parse_status: str = "ready"  # ready | unsupported | failed | needs_ocr
    chunk_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # 全文不进 API 响应，避免 payload 过大
        d.pop("text", None)
        d.pop("embedding", None)
        return d


@dataclass
class KnowledgePlacement:
    id: str
    document_id: str
    primary_building_id: str | None
    secondary_building_ids: list[str] = field(default_factory=list)
    topic_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    margin: float = 0.0
    reason: str = ""
    evidence_chunk_ids: list[str] = field(default_factory=list)
    state: str = "proposed"  # proposed | confirmed | rejected | needs_review
    model_version: str = "keyword-mock-v1"
    confirmed_by: str | None = None  # user | rule
    confirmed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BuildingProfile:
    id: str
    name: str
    description: str
    embedding: list[float] = field(default_factory=list)
    is_discovered: bool = False

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("embedding", None)
        return d


@dataclass
class Topic:
    id: str
    name: str
    description: str = ""
    keywords: list[str] = field(default_factory=list)
    building_id: str | None = None
    state: str = "proposed"  # proposed | confirmed | materialized
    representative_document_ids: list[str] = field(default_factory=list)
    nearest_building_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BuildingGenesisCandidate:
    candidate_id: str
    topic_id: str
    proposed_name: str
    proposed_description: str = ""
    representative_document_ids: list[str] = field(default_factory=list)
    evidence_chunk_ids: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    nearest_building_ids: list[str] = field(default_factory=list)
    novelty_score: float = 0.0
    cohesion_score: float = 0.0
    suggested_scene_type: str | None = None
    suggested_visual_brief: str | None = None
    state: str = "proposed"  # proposed | confirmed | materializing | ready | rejected | failed
    classifier_version: str = "keyword-mock-v1"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BuildingJob:
    job_id: str
    candidate_id: str
    state: str = "pending"  # pending | running | ready | failed | cancelled
    result: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
