"""轻量 demo 候选聚合：不做向量和 KMeans，将本批新知识按关键词聚为一组。"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from . import db
from .config import MIN_CLUSTER_DOCS


_CJK_RE = re.compile(r"[\u4e00-\u9fff]{2,}")
_EN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-]{2,}")
_STOPWORDS = {"我们", "一个", "这个", "那个", "没有", "可以", "进行", "以及", "需要", "已经", "the", "and", "for", "with"}


def _keywords_from(texts: list[str], top_n: int = 8) -> list[str]:
    counter: Counter[str] = Counter()
    for text in texts:
        for match in _CJK_RE.findall(text):
            for size in (2, 3, 4):
                for index in range(len(match) - size + 1):
                    token = match[index:index + size]
                    if token not in _STOPWORDS:
                        counter[token] += 1
        for word in _EN_WORD_RE.findall(text):
            if word.casefold() not in _STOPWORDS:
                counter[word.casefold()] += 1
    return [word for word, _ in counter.most_common(top_n)]


def cluster_documents(document_ids: list[str]) -> list[dict[str, Any]]:
    if len(document_ids) < MIN_CLUSTER_DOCS:
        return []
    documents = [db.get_document(document_id) for document_id in document_ids]
    documents = [document for document in documents if document]
    if len(documents) < MIN_CLUSTER_DOCS:
        return []
    texts = [f"{document['title']} {document['summary']}" for document in documents]
    return [{
        "doc_ids": [document["id"] for document in documents],
        "keywords": _keywords_from(texts),
        "cohesion": 1.0,
    }]
