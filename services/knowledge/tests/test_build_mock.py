"""build() 异步落库集成测试：用 mock generation-proxy，验证
candidate → build → 后台生成 → 落库（asset+position）→ placement 指向新建筑。

不消耗真实 lux3D 积分。
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MOCK_PORT = 18789
os.environ["GEN_PROXY_BASE_URL"] = f"http://127.0.0.1:{MOCK_PORT}"

FAKE_GLB = b"glTF-fake"


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/prompt/plan":
            self._json(200, {"prompt": "正面的未来量子实验室", "plannedBy": "mock"})
        elif self.path == "/t2i":
            self._json(200, {"imageUrl": "http://mock/i.png"})
        elif self.path == "/i2d/create":
            self._json(200, {"taskid": 1})
        else:
            self._json(404, {"error": "unknown"})

    def do_GET(self):
        if self.path.startswith("/i2d/poll"):
            self._json(200, {"status": 3, "done": True, "failed": False,
                             "glbUrl": f"http://127.0.0.1:{MOCK_PORT}/m.glb"})
        elif self.path == "/m.glb":
            self.send_response(200)
            self.send_header("Content-Length", str(len(FAKE_GLB)))
            self.end_headers()
            self.wfile.write(FAKE_GLB)
        else:
            self._json(404, {"error": "unknown"})


def main():
    # 用独立临时数据目录，避免污染真实库
    import shutil
    tmp = Path(__file__).resolve().parent.parent / "_tmp_build_test"
    shutil.rmtree(tmp, ignore_errors=True)  # 每次运行前清干净
    os.environ["LKS_DATA_DIR"] = str(tmp / "data")

    server = HTTPServer(("127.0.0.1", MOCK_PORT), MockHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app import db, building_genesis
    building_genesis.GENERATED_ASSET_DIR = tmp / "generated"

    db.init_db()
    # 本用例只验证 generation-proxy 与落库，不应偷偷依赖本地 Ollama。

    # 构造一个候选 + 3 篇代表文档，模拟真实场景
    docs = []
    for i in range(3):
        did = f"doc-{i}"
        db.upsert_document({
            "id": did, "source_path": f"/tmp/{i}.md", "source_root_id": "t",
            "sha256": f"sha{i}", "title": f"量子文档{i}", "mime_type": "text/markdown",
            "modified_at": "0", "text": "量子计算 量子纠缠 量子门", "summary": f"量子{i}",
            "embedding": [], "parse_status": "ready",
        })
        # 模拟 classify 产物：新颖文档 → primary=None 的 needs_review placement
        db.upsert_placement({
            "id": f"placement-{i}", "document_id": did, "primary_building_id": None,
            "secondary_building_ids": [], "topic_ids": [], "confidence": 0.3,
            "margin": 0.0, "reason": "新颖", "evidence_chunk_ids": [],
            "state": "needs_review", "model_version": "test", "confirmed_by": None,
            "confirmed_at": None,
        })
        docs.append(did)

    candidate_id = "cand-test"
    topic_id = "topic-test"
    db.upsert_candidate({
        "candidate_id": candidate_id, "topic_id": topic_id,
        "proposed_name": "量子实验室", "proposed_description": "量子计算研究",
        "representative_document_ids": docs, "evidence_chunk_ids": [],
        "keywords": ["量子"], "nearest_building_ids": [], "novelty_score": 0.5,
        "cohesion_score": 0.6, "suggested_scene_type": "实验室",
        "suggested_visual_brief": "一座未来感量子实验室建筑", "state": "proposed",
        "classifier_version": "test",
    })
    db.upsert_topic({
        "id": topic_id, "name": "量子实验室", "description": "量子计算研究",
        "keywords": ["量子"], "building_id": None, "state": "proposed",
        "representative_document_ids": docs, "nearest_building_ids": [],
    })

    # confirm + build
    building_genesis.confirm(candidate_id)
    job = building_genesis.build(candidate_id, idempotency_key="k-1")
    print("job 初始 state:", job["state"])

    # 等待后台线程完成（mock 很快）
    deadline = time.time() + 15
    while time.time() < deadline:
        job = db.get_job(job["job_id"])
        if job["state"] in ("ready", "failed"):
            break
        time.sleep(0.3)

    print("job 最终 state:", job["state"])
    print("job result:", job["result"])

    building_id = job["result"].get("building_id")
    assert job["state"] == "ready", f"期望 ready，实际 {job['state']}"
    assert building_id, "缺 building_id"
    assert job["result"].get("prompt"), "缺 DeepSeek 生图指令"
    assert job["result"].get("asset", "").startswith("/assets/generated/"), "asset 路径错误"
    assert job["result"].get("position"), "缺 position"

    # 验证建筑落库
    b = db.get_building(building_id)
    assert b and b["is_discovered"], "建筑未落库或未标记 discovered"
    assert b["asset"] == job["result"]["asset"], "建筑 asset 不匹配"
    assert b["position"] == job["result"]["position"], "建筑 position 不匹配"
    print("建筑落库:", b["name"], b["asset"], b["position"])

    # 验证代表文档 placement 指向新建筑
    for did in docs:
        p = db.get_placement_by_document(did)
        assert p and p["primary_building_id"] == building_id, f"{did} placement 未指向新建筑"
    print("代表文档已映射到新建筑")

    # 验证幂等：同 key 再 build 返回同一 job
    job2 = building_genesis.build(candidate_id, idempotency_key="k-1")
    assert job2["job_id"] == job["job_id"], "幂等失败"
    print("幂等验证通过:", job2["job_id"] == job["job_id"])

    server.shutdown()
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    print("\nBUILD E2E PASS")


if __name__ == "__main__":
    main()
