"""Portable configuration for the local Metrobsidian knowledge service."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent.parent


def _csv(name: str, fallback: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, fallback).split(",") if item.strip()]


def _paths(name: str, fallback: list[Path]) -> list[Path]:
    raw = os.environ.get(name, "")
    values = raw.split(os.pathsep) if raw else [str(path) for path in fallback]
    return [Path(value).expanduser().resolve() for value in values if value.strip()]


DEFAULT_DATA_DIR = BASE_DIR / "data"
DATA_DIR = Path(os.environ.get("LKS_DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
DB_PATH = DATA_DIR / "knowledge.db"
UPLOAD_DIR = DATA_DIR / "uploads"

CORS_ORIGINS = _csv(
    "LKS_CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173",
)
ALLOWED_SOURCE_ROOTS = _paths(
    "LKS_ALLOWED_ROOTS",
    [REPO_ROOT / "content" / "demo-knowledge-base"],
)

BUILDING_SEEDS: dict[str, dict[str, str]] = {
    "company": {
        "name": "公司",
        "description": "职业、项目、产品、创业、工作、决策与创造、内容生产系统、公开边界、助手与视觉工作台",
    },
    "home": {
        "name": "家庭",
        "description": "家庭与日常、个人管理、生活与关系、搬家、注意力、长期成长、训练",
    },
    "school": {
        "name": "学校",
        "description": "学习、阅读、研究方法、商业模式与壁垒、研究笔记、工具不是结论、创意 Agent",
    },
    "hospital": {
        "name": "医院",
        "description": "健康检查、复盘、知识库健康检查、质量诊断、修复记录、性能复盘、训练复盘",
    },
    "canteen": {
        "name": "食堂",
        "description": "内容、兴趣、测试记录、视觉实验、封面测试、创作、可共享的创作记录",
    },
    "construction": {
        "name": "施工工地",
        "description": "进行中的实验、在建项目、黑客松、技能分类、灵感、未完成工程、创意设想",
    },
    "characters": {
        "name": "角色广场",
        "description": "角色、人物、动物、Agent、牛来的牛、DeepSeek、鲸鱼、行动与任务",
    },
    "museum": {
        "name": "美术馆",
        "description": "艺术史、美术、绘画、雕塑、建筑美学、展览、艺术家、古典与当代艺术",
    },
}

BUILDING_POSITIONS: dict[str, tuple[int, int]] = {
    "company": (-52, -48), "home": (62, -48), "school": (-68, 48),
    "hospital": (70, 48), "canteen": (-25, 72), "construction": (50, 76),
    "characters": (-98, -48), "museum": (80, -72),
}

MIN_CLUSTER_DOCS = 3
SUPPORTED_EXTENSIONS = {".md", ".markdown", ".txt"}
SKIP_DIR_NAMES = {"node_modules", ".git", ".hallmark", "dist", "__pycache__", ".venv", "venv"}
SKIP_FILE_NAMES = {"README.md"}
MIN_TEXT_LENGTH = 40
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_UPLOAD_BYTES = 128 * 1024 * 1024

GEN_PROXY_BASE_URL = os.environ.get("GEN_PROXY_BASE_URL", "http://127.0.0.1:8788")
GEN_PROXY_TIMEOUT = int(os.environ.get("GEN_PROXY_TIMEOUT", "300"))
GEN_POLL_INTERVAL = 12
GEN_MAX_POLL_SECONDS = 600

MAP_DIR = REPO_ROOT / "apps" / "city"
GENERATED_ASSET_DIR = MAP_DIR / "public" / "assets" / "generated"

CATEGORY_PLOTS: list[tuple[int, int]] = [
    (-170, -145), (-85, -145), (82, -145), (170, -145),
    (170, 145), (82, 145), (-85, 145), (-170, 145),
]

UPLOAD_PLOTS_BY_CATEGORY: dict[str, tuple[int, int]] = {
    "company": (-88, -48), "home": (92, -48), "school": (-98, 48),
    "hospital": (100, 48), "canteen": (-54, 76), "construction": (78, 76),
    "characters": (-92, -74), "museum": (52, -76), "novel": (52, -76),
}
