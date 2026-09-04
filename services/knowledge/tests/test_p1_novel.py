"""P1 专项测试：构造真正「新颖」的文档，验证新主题发现 + 新建筑生长全链路。"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"

# 三篇与 6 栋核心建筑（工作/生活/学习/复盘/创作/实验）都无关的新颖主题文档
NOVEL_DOCS = {
    "量子计算入门.md": """# 量子计算入门
量子比特叠加态与量子纠缠是量子计算的核心概念。量子门操作与量子线路设计，
Shor 算法与 Grover 算法用于量子加速。量子退相干与量子纠错是工程难点。""",
    "天体物理观测.md": """# 天体物理观测
射电望远镜与光学望远镜观测恒星演化。黑洞吸积盘与引力波探测，
宇宙微波背景辐射与暗物质暗能量研究，系外行星搜寻方法。""",
    "弦理论概览.md": """# 弦理论概览
弦理论与超弦理论的基本框架。额外维度紧致化与卡拉比-丘流形，
膜宇宙与 M 理论，量子引力与全息原理的联系。""",
}


def section(name: str) -> None:
    print(f"\n=== {name} ===")


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        sys.exit(1)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        for fname, content in NOVEL_DOCS.items():
            Path(tmp, fname).write_text(content, encoding="utf-8")

        section("扫描新颖文档")
        src = requests.post(f"{BASE}/api/sources/folders/select", json={"path": tmp}).json()
        scan = requests.post(f"{BASE}/api/sources/{src['id']}/scan").json()
        check("扫描完成", scan["state"] == "done", str(scan.get("stats")))

        section("新颖文档进入待发现池")
        inbox = requests.get(f"{BASE}/api/placements/inbox").json()
        novel = [
            i for i in inbox["items"]
            if i["primary_building_id"] is None and i["state"] == "needs_review"
        ]
        check("有 primary=None 的新颖文档", len(novel) >= 3, f"novel={len(novel)}")

        section("发现候选主题")
        disc = requests.post(f"{BASE}/api/building-genesis/candidates").json()
        cands = disc["items"]
        check("关键词聚合产出候选", len(cands) >= 1, f"candidates={len(cands)}")
        if not cands:
            print("  无候选，终止")
            return
        for c in cands:
            print(f"  候选: '{c['proposed_name']}' cohesion={c['cohesion_score']} "
                  f"kw={c['keywords'][:5]} scene={c.get('suggested_scene_type')}")

        c = cands[0]

        section("预览")
        prev = requests.get(f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/preview").json()
        check("预览含代表文档", len(prev.get("representative_documents", [])) >= 1)

        section("未确认 build 应被拒绝")
        r = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/build",
            json={"idempotency_key": "k-unconfirmed"},
        )
        check("未确认 build 返回 409", r.status_code == 409, f"status={r.status_code}")

        section("确认 + build（幂等）")
        requests.post(f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/confirm")
        job1 = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/build",
            json={"idempotency_key": "k-1"},
        ).json()
        check("build 返回 ready", job1["state"] == "ready", str(job1.get("result")))

        job2 = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/build",
            json={"idempotency_key": "k-1"},
        ).json()
        check("同 key 幂等", job2["job_id"] == job1["job_id"],
              f"{job1['job_id']} vs {job2['job_id']}")

        section("新建筑出现在建筑列表")
        buildings = requests.get(f"{BASE}/api/buildings").json()
        discovered = [b for b in buildings["items"] if b["is_discovered"]]
        new_building_id = job1["result"]["building_id"]
        check("新建筑已创建", any(b["id"] == new_building_id for b in discovered),
              new_building_id)

        section("新建筑内有知识")
        docs = requests.get(f"{BASE}/api/buildings/{new_building_id}/documents").json()
        check("新建筑文档 > 0", docs["total"] > 0, f"total={docs['total']}")

    print("\n=== P1 全链路通过 ===")


if __name__ == "__main__":
    main()
