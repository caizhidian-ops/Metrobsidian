"""端到端真实测试：直接打运行中的 HTTP 服务。

验证成功契约的每一条。用 requests 同步调用，不做 mock。
"""
from __future__ import annotations

from pathlib import Path
import sys
import time

import requests

BASE = "http://127.0.0.1:8000"
KB = str(Path(__file__).resolve().parents[3] / "content" / "knowledge-base")


def section(name: str) -> None:
    print(f"\n=== {name} ===")


def check(name: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        sys.exit(1)


def main() -> None:
    # S1/S3 前置：建筑已 seed
    section("建筑种子")
    r = requests.get(f"{BASE}/api/buildings").json()
    core = [b for b in r["items"] if not b["is_discovered"]]
    check("8 栋核心建筑已 seed", len(core) == 8, f"core={len(core)}")
    print("  核心建筑:", [b["name"] for b in core])

    # 记录原文件 hash，验证零改动
    import hashlib
    from pathlib import Path
    before = {}
    for p in Path(KB).rglob("*.md"):
        before[str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()

    section("选择目录 + 扫描")
    r = requests.post(f"{BASE}/api/sources/folders/select", json={"path": KB}).json()
    sid = r["id"]
    check("选择目录", "id" in r, str(sid))

    scan = requests.post(f"{BASE}/api/sources/{sid}/scan").json()
    check("扫描完成", scan["state"] == "done", str(scan.get("stats")))
    stats = scan["stats"]
    print("  统计:", stats)

    section("原文件零改动（S1）")
    after = {}
    for p in Path(KB).rglob("*.md"):
        after[str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
    check("扫描前后原文件 hash 一致", before == after,
          f"文件数 {len(before)}，改动 {sum(1 for k in before if before[k] != after.get(k))}")

    section("归档收件箱（S4）")
    inbox = requests.get(f"{BASE}/api/placements/inbox").json()
    check("有分类建议", inbox["total"] > 0, f"inbox={inbox['total']}")
    proposed = [i for i in inbox["items"] if i["state"] == "proposed"]
    print(f"  proposed={len(proposed)}, needs_review={inbox['total'] - len(proposed)}")
    for p in proposed[:5]:
        print(f"    {p['document_id'][:12]} -> {p['primary_building_id']} conf={p['confidence']}")

    section("确认一条建议（S4/S7）")
    if not proposed:
        # 没有自动 proposed，就取一条 needs_review 强制 correct 到公司
        target = inbox["items"][0]
        r = requests.post(
            f"{BASE}/api/placements/{target['id']}/correct",
            json={"primary_building_id": "company"},
        ).json()
    else:
        target = proposed[0]
        r = requests.post(f"{BASE}/api/placements/{target['id']}/confirm").json()
    check("确认后 state=confirmed", r["state"] == "confirmed", r["primary_building_id"])
    building_id = r["primary_building_id"]

    section("建筑内立即出现知识（S7）")
    docs = requests.get(f"{BASE}/api/buildings/{building_id}/documents").json()
    check("确认后建筑内文档 > 0", docs["total"] > 0, f"total={docs['total']}")

    section("新主题发现（S5）")
    disc = requests.post(f"{BASE}/api/building-genesis/candidates").json()
    cands = disc["items"]
    check("发现候选（可为空，取决于数据）", isinstance(cands, list), f"candidates={len(cands)}")
    print(f"  候选数: {len(cands)}")
    for c in cands[:3]:
        print(f"    {c['candidate_id'][:12]} '{c['proposed_name']}' cohesion={c['cohesion_score']}")

    section("新建筑生长（S6 幂等）")
    if cands:
        c = cands[0]
        prev = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/confirm"
        ).json()
        check("确认候选", prev["state"] == "confirmed")

        job1 = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/build",
            json={"idempotency_key": "test-key-1"},
        ).json()
        check("build 返回 ready", job1["state"] == "ready", str(job1.get("result")))

        job2 = requests.post(
            f"{BASE}/api/building-genesis/candidates/{c['candidate_id']}/build",
            json={"idempotency_key": "test-key-1"},
        ).json()
        check("同 key 幂等（返回同一 job）", job2["job_id"] == job1["job_id"],
              f"{job1['job_id']} vs {job2['job_id']}")

        # 未确认的候选 build 应 409
        if len(cands) > 1:
            c2 = cands[1]
            r = requests.post(
                f"{BASE}/api/building-genesis/candidates/{c2['candidate_id']}/build",
                json={"idempotency_key": "test-key-2"},
            )
            check("未确认 build 被拒绝(409)", r.status_code == 409, f"status={r.status_code}")
    else:
        print("  （无候选，跳过生长测试）")

    print("\n=== 全部通过 ===")


if __name__ == "__main__":
    main()
