"""AI 生成建筑客户端：对接队友的 generation-proxy（Node 服务）。

契约（见 services/generation/generation-proxy.mjs）：
  POST /t2i           {prompt, stylePreset} → {imageUrl, augmentedPrompt}
  POST /i2d/create    {imageUrl}            → {taskid}
  GET  /i2d/poll?taskid=N                   → {status, done, failed, glbUrl, error}
  GET  /health                              → {ok, t2i, lux3d}

密钥全部留在 generation-proxy 服务端（.env.local），本模块只做 HTTP 调用，
不持有任何密钥。lux3D 返回的 glbUrl 是预签名公开 URL，可直接下载。
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import requests

from .config import (
    GEN_PROXY_BASE_URL,
    GEN_PROXY_TIMEOUT,
    GEN_POLL_INTERVAL,
    GEN_MAX_POLL_SECONDS,
)


class GenerationError(RuntimeError):
    """生成链路任一环节失败时抛出。"""


def _post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        resp = requests.post(
            f"{GEN_PROXY_BASE_URL}{path}", json=body, timeout=GEN_PROXY_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise GenerationError(f"generation-proxy 不可达（{GEN_PROXY_BASE_URL}）: {exc}") from exc
    try:
        data = resp.json()
    except ValueError:
        raise GenerationError(f"generation-proxy 返回非 JSON（HTTP {resp.status_code}）") from None
    if resp.status_code >= 400:
        raise GenerationError(f"{path} 失败（HTTP {resp.status_code}）: {data.get('error', data)}")
    return data


def _get(path: str) -> dict[str, Any]:
    try:
        resp = requests.get(f"{GEN_PROXY_BASE_URL}{path}", timeout=GEN_PROXY_TIMEOUT)
    except requests.RequestException as exc:
        raise GenerationError(f"generation-proxy 不可达: {exc}") from exc
    try:
        return resp.json()
    except ValueError:
        raise GenerationError(f"generation-proxy 返回非 JSON（HTTP {resp.status_code}）") from None


def health() -> dict[str, Any]:
    return _get("/health")


def text_to_image(prompt: str, style_preset: bool = True) -> str:
    """文生图，返回图片 URL。"""
    data = _post("/t2i", {"prompt": prompt, "stylePreset": style_preset})
    image_url = data.get("imageUrl")
    if not image_url:
        raise GenerationError(f"文生图未返回图片 URL: {data}")
    return image_url


def plan_building_prompt(category: str, title: str, summary: str) -> str:
    """让 generation-proxy 中的 DeepSeek 只在明确的建筑生成任务中编写生图指令。"""
    data = _post("/prompt/plan", {"category": category, "title": title, "summary": summary})
    prompt = data.get("prompt")
    if not prompt:
        raise GenerationError(f"DeepSeek 未返回建筑生图指令: {data}")
    return prompt


def image_to_3d(image_url: str) -> int:
    """图生 3D 创建任务，返回 taskid。"""
    data = _post("/i2d/create", {"imageUrl": image_url})
    taskid = data.get("taskid")
    if isinstance(taskid, str) and taskid.isdigit():
        taskid = int(taskid)
    if not isinstance(taskid, int):
        raise GenerationError(f"图生 3D 未返回 taskid: {data}")
    return taskid


def poll_3d_until_done(taskid: int) -> str:
    """轮询直到图生 3D 完成，返回 glbUrl。"""
    deadline = time.monotonic() + GEN_MAX_POLL_SECONDS
    while time.monotonic() < deadline:
        data = _get(f"/i2d/poll?taskid={taskid}")
        if data.get("failed"):
            raise GenerationError(f"图生 3D 失败: {data.get('error', data)}")
        if data.get("done"):
            glb_url = data.get("glbUrl")
            if glb_url:
                return glb_url
            raise GenerationError(f"图生 3D 完成但未返回 glbUrl: {data}")
        time.sleep(GEN_POLL_INTERVAL)
    raise GenerationError(f"图生 3D 超时（>{GEN_MAX_POLL_SECONDS}s）")


def download_glb(glb_url: str, dest: Path) -> Path:
    """下载 GLB 到指定路径，返回保存路径。"""
    try:
        resp = requests.get(glb_url, timeout=GEN_PROXY_TIMEOUT)
    except requests.RequestException as exc:
        raise GenerationError(f"下载 GLB 失败: {exc}") from exc
    if resp.status_code != 200:
        raise GenerationError(f"下载 GLB 失败（HTTP {resp.status_code}）")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(resp.content)
    return dest


def generate_building_glb(
    prompt: str,
    building_id: str,
    asset_dir: Path,
    *,
    category: str = "",
    summary: str = "",
    on_stage=None,
) -> str:
    """完整生成链路：文生图 → 图生 3D → 下载 GLB。

    返回前端可引用的相对资产路径（如 /assets/generated/<id>.glb）。
    """
    if on_stage:
        on_stage("planning_prompt", {"prompt": prompt})
    planned_prompt = plan_building_prompt(category, prompt, summary) if category else prompt
    if on_stage:
        on_stage("generating_image", {"prompt": planned_prompt})
    image_url = text_to_image(planned_prompt, style_preset=not bool(category))
    if on_stage:
        on_stage("generating_3d", {"prompt": planned_prompt, "image_url": image_url})
    taskid = image_to_3d(image_url)
    glb_url = poll_3d_until_done(taskid)
    if on_stage:
        on_stage("saving_asset", {"prompt": planned_prompt, "image_url": image_url})
    dest = asset_dir / f"{building_id}.glb"
    download_glb(glb_url, dest)
    return f"/assets/generated/{building_id}.glb"
