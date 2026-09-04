"""只读扫描器：遍历目录、过滤、SHA-256 去重。

绝不写入、移动、删除源文件。只读取内容做哈希与解析。
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Iterator

from .config import (
    SKIP_DIR_NAMES,
    SKIP_FILE_NAMES,
    SUPPORTED_EXTENSIONS,
    MAX_FILE_BYTES,
)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_skipped_dir(parts: tuple[str, ...]) -> bool:
    return any(p in SKIP_DIR_NAMES for p in parts)


def _is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts if part not in ("..", "."))


def iter_files(root: Path) -> Iterator[Path]:
    """遍历 root 下所有应纳入扫描的文件，已过滤目录/扩展名/大小/隐藏。"""
    if not root.exists():
        return
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(root).parts
        if _is_skipped_dir(rel_parts):
            continue
        if _is_hidden(path):
            continue
        if path.name in SKIP_FILE_NAMES:
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        yield path


def scan_files(root: Path) -> list[dict]:
    """返回 [{path, sha256, size, modified_at}]，按路径稳定排序。"""
    out: list[dict] = []
    for path in iter_files(root):
        try:
            stat = path.stat()
        except OSError:
            continue
        out.append({
            "path": str(path),
            "relative": str(path.relative_to(root)),
            "sha256": _sha256(path),
            "size": stat.st_size,
            "modified_at": stat.st_mtime,
        })
    return out
