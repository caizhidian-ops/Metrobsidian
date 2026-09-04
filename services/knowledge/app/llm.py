"""Demo 主题命名：纯本地字符串规则，不请求 Ollama 或其他模型。"""
from __future__ import annotations


def name_topic(doc_summaries: list[str]) -> dict:
    first = (doc_summaries[0] if doc_summaries else "新知识").split("：", 1)[0].strip()
    name = f"{first[:6]}馆" if first else "新知识馆"
    return {
        "name": name,
        "description": "；".join(doc_summaries[:3])[:240],
        "sceneType": "知识展馆",
        "visualBrief": "",
    }
