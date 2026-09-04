"""纯文本解析（MD/TXT）：Docling 的首版降级实现。

只覆盖 Markdown 与纯文本。解析出标题、摘要、正文文本。
设计文档要求多格式（PDF/DOCX/PPTX/XLSX）由 Docling 处理；此处明确不引入，
保持零 torch 依赖。未来接入 Docling 时替换本模块即可，接口不变。
"""
from __future__ import annotations

import re
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree


def _strip_markdown(md: str) -> str:
    """去掉常见的 markdown 语法，保留可读正文。"""
    lines = md.splitlines()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append("")
            continue
        # 表格分隔行
        if re.fullmatch(r"\|?[\s:|-]+\|?", stripped) and "-" in stripped:
            continue
        # 图片引用
        if stripped.startswith("!["):
            continue
        # 链接保留文字部分
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        # 行内代码、粗体、斜体
        line = re.sub(r"`([^`]*)`", r"\1", line)
        line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        line = re.sub(r"\*([^*]+)\*", r"\1", line)
        line = re.sub(r"__([^_]+)__", r"\1", line)
        # 标题、引用、列表符号
        line = re.sub(r"^#{1,6}\s+", "", line)
        line = re.sub(r"^>\s?", "", line)
        line = re.sub(r"^\s*[-*+]\s+", "", line)
        line = re.sub(r"^\s*\d+[.)]\s+", "", line)
        out.append(line)
    return "\n".join(out)


def _title_from(text: str, filename: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, flags=re.MULTILINE)
    if m:
        return m.group(1).strip()
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith(("#", ">", "-", "|", "!")):
            return line[:80]
    return Path(filename).stem


def _summary_from(text: str) -> str:
    """取第一个足够长的非空段落作为摘要。"""
    blocks = re.split(r"\n\s*\n", text)
    for block in blocks:
        cleaned = " ".join(block.split())
        cleaned = re.sub(r"^#+\s*", "", cleaned)
        if len(cleaned) >= 18:
            return cleaned[:120]
    return "已收录的知识档案。"


def parse_text(path: Path, raw: str) -> dict:
    """解析为 {title, summary, text}。text 为去 markdown 的纯正文。"""
    text = _strip_markdown(raw)
    title = _title_from(raw, path.name)
    summary = _summary_from(raw)
    return {"title": title, "summary": summary, "text": text}


def parse_bytes(path: Path, data: bytes) -> dict:
    text = data.decode("utf-8", errors="replace")
    return parse_text(path, text)


TEXT_EXTENSIONS = {
    ".md", ".markdown", ".txt", ".csv", ".json", ".jsonl", ".xml", ".yaml", ".yml",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".hpp",
    ".css", ".scss", ".html", ".htm", ".sql", ".log", ".ini", ".toml", ".tex",
}


def parse_upload_bytes(path: Path, data: bytes, content_type: str = "") -> dict:
    """Best-effort extraction for drag/drop uploads.

    Every format is accepted for archival. Text and common Office containers are
    extracted locally; formats without a safe parser fall back to filename/MIME
    metadata so they can still be classified without being executed.
    """
    suffix = path.suffix.lower()
    if suffix in TEXT_EXTENSIONS or content_type.startswith("text/"):
        parsed = parse_bytes(path, data)
        return {**parsed, "parse_status": "ready"}

    extracted = ""
    if suffix == ".docx":
        extracted = _extract_zip_xml(data, ("word/document.xml",))
    elif suffix == ".pptx":
        extracted = _extract_zip_xml(data, ("ppt/slides/",))
    elif suffix == ".xlsx":
        extracted = _extract_zip_xml(data, ("xl/sharedStrings.xml", "xl/worksheets/"))
    elif suffix == ".pdf":
        extracted = _extract_pdf(data)

    if extracted.strip():
        normalized = "\n".join(line.strip() for line in extracted.splitlines() if line.strip())
        return {
            "title": path.stem,
            "summary": _summary_from(normalized),
            "text": normalized,
            "parse_status": "ready",
        }

    hint = _semantic_hint(suffix, content_type)
    metadata = (
        f"文件名：{path.name}\n"
        f"文件类型：{content_type or '未知'}\n"
        f"扩展名：{suffix or '无扩展名'}\n"
        f"分类线索：{hint}\n"
        "正文状态：文件已安全归档，当前解析器暂不能读取正文；系统不会执行该文件。"
    )
    return {
        "title": path.name,
        "summary": f"{path.name} · {hint}（正文暂不可解析）",
        "text": metadata,
        "parse_status": "unsupported",
    }


def _extract_zip_xml(data: bytes, prefixes: tuple[str, ...]) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            names = [name for name in archive.namelist() if any(name.startswith(prefix) for prefix in prefixes)]
            fragments: list[str] = []
            for name in sorted(names):
                root = ElementTree.fromstring(archive.read(name))
                fragments.extend(node.text for node in root.iter() if node.text and node.text.strip())
            return "\n".join(fragments)
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError, OSError):
        return ""


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except (ImportError, OSError, ValueError):
        return ""


def _semantic_hint(suffix: str, content_type: str) -> str:
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".psd", ".ai", ".mp3", ".wav", ".flac", ".mp4", ".mov", ".mkv"} or content_type.startswith(("image/", "audio/", "video/")):
        return "视觉、影音、内容创作与兴趣素材"
    if suffix in {".xls", ".xlsx", ".ods", ".csv"}:
        return "数据、表格、项目与工作资料"
    if suffix in {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".epub"}:
        return "阅读、学习、研究与工作文档"
    if suffix in {".zip", ".7z", ".rar", ".tar", ".gz", ".exe", ".msi", ".apk", ".bin"}:
        return "工程、工具、实验与归档素材"
    return "个人知识库待分类素材"
