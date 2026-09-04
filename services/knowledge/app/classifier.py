"""DeepSpace demo 分类器：纯本地关键词规则，无向量和模型依赖。"""
from __future__ import annotations

import uuid
from typing import Any

from . import db
from .config import BUILDING_SEEDS


CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "company": ("公司", "工作", "项目", "产品", "需求", "客户", "决策", "创业", "运营", "合规"),
    "home": ("家庭", "家人", "生活", "日常", "搬家", "居住", "关系", "成长", "亲子"),
    "school": ("学校", "学习", "阅读", "研究", "课程", "教育", "笔记", "论文", "方法"),
    "hospital": ("医院", "健康", "医疗", "诊断", "检查", "修复", "训练", "运动", "康复"),
    "canteen": ("食堂", "餐饮", "食物", "菜品", "厨房", "味觉", "分享", "封面", "视觉实验"),
    "construction": ("施工", "在建", "开发", "实验", "灵感", "待办", "未完成", "技能", "hackathon"),
    "characters": ("角色", "人物", "agent", "deepseek", "牛来的牛", "鲸鱼", "巡游", "任务"),
    "museum": (
        "艺术", "美术", "绘画", "雕塑", "文艺复兴", "艺术史", "艺术家", "博物馆",
        "美术馆", "展览", "古典美", "当代艺术", "视觉文化", "建筑美学",
    ),
}


def ensure_buildings_seeded() -> None:
    existing = {building["id"] for building in db.list_buildings()}
    for building_id, seed in BUILDING_SEEDS.items():
        if building_id in existing:
            continue
        db.upsert_building({
            "id": building_id,
            "name": seed["name"],
            "description": seed["description"],
            "embedding": [],
            "is_discovered": False,
        })


def classify(document_id: str, text: str) -> dict[str, Any]:
    normalized = text.casefold()
    scored = [
        (sum(normalized.count(keyword.casefold()) for keyword in keywords), building_id)
        for building_id, keywords in CATEGORY_KEYWORDS.items()
    ]
    scored.sort(key=lambda item: (-item[0], item[1]))
    score_by_building = {building_id: score for score, building_id in scored}
    # 艺术是用户明确的稳定路由词：只要命中，就应进美术馆，
    # 不让文章中较多的“生活”“成长”等泛词把它抢到家庭分区。
    museum_priority = score_by_building.get("museum", 0) > 0
    if museum_priority:
        primary = "museum"
        top_score = score_by_building[primary]
        scored = [(top_score, primary), *[item for item in scored if item[1] != primary]]
    else:
        top_score, primary = scored[0]
    if top_score <= 0:
        return _novelty_placement(document_id)

    second_score = scored[1][0] if len(scored) > 1 else 0
    confidence = min(0.98, 0.62 + 0.08 * top_score)
    margin = 1.0 if museum_priority else min(1.0, (top_score - second_score) / max(top_score, 1))
    secondary = [building_id for score, building_id in scored[1:] if score > 0][:3]
    return {
        "id": f"placement-{uuid.uuid4().hex[:12]}",
        "document_id": document_id,
        "primary_building_id": primary,
        "secondary_building_ids": secondary,
        "topic_ids": [],
        "confidence": round(confidence, 4),
        "margin": round(margin, 4),
        "reason": f"关键词 mock 匹配到「{BUILDING_SEEDS[primary]['name']}」（命中 {top_score} 次）。",
        "evidence_chunk_ids": [],
        "state": "proposed",
        "model_version": "keyword-mock-v1",
        "confirmed_by": None,
        "confirmed_at": None,
    }

def _novelty_placement(document_id: str) -> dict[str, Any]:
    return {
        "id": f"placement-{uuid.uuid4().hex[:12]}",
        "document_id": document_id,
        "primary_building_id": None,
        "secondary_building_ids": [],
        "topic_ids": [],
        "confidence": 0.0,
        "margin": 0.0,
        "reason": "未命中已知分区关键词，已进入新知识候选。",
        "evidence_chunk_ids": [],
        "state": "needs_review",
        "model_version": "keyword-mock-v1",
        "confirmed_by": None,
        "confirmed_at": None,
    }
