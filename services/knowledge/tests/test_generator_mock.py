"""Mock generation-proxy：验证 generator.py 对接逻辑（不依赖真实密钥）。

模拟 /t2i → /i2d/create → /i2d/poll 三端点，返回固定响应，
再调用 generator.generate_building_glb 走完整链路，断言产物正确。
"""
from __future__ import annotations

import json
import sys
import threading
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MOCK_PORT = 18788

# 让 generator 指向 mock
import os
os.environ["GEN_PROXY_BASE_URL"] = f"http://127.0.0.1:{MOCK_PORT}"

FAKE_GLB = b"glTF-binary-fake-bytes-for-testing"


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # 静默
        pass

    def _send(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/t2i":
            self._send(200, {"imageUrl": "http://mock/image.png", "augmentedPrompt": body.get("prompt", "")})
        elif self.path == "/i2d/create":
            self._send(200, {"taskid": 12345})
        else:
            self._send(404, {"error": "unknown"})

    def do_GET(self):
        if self.path.startswith("/i2d/poll"):
            self._send(200, {"status": 3, "done": True, "failed": False, "glbUrl": "http://127.0.0.1:18788/model.glb"})
        elif self.path == "/health":
            self._send(200, {"ok": True})
        elif self.path == "/model.glb":
            self.send_response(200)
            self.send_header("Content-Type", "model/gltf-binary")
            self.send_header("Content-Length", str(len(FAKE_GLB)))
            self.end_headers()
            self.wfile.write(FAKE_GLB)
        else:
            self._send(404, {"error": "unknown"})


def main():
    server = HTTPServer(("127.0.0.1", MOCK_PORT), MockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app import generator

    # 走完整链路，产物只写入临时目录。
    prompt = "量子物理实验室"
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp)
        asset = generator.generate_building_glb(prompt, "test-building", output_dir)
        print("asset path:", asset)
        glb_path = output_dir / "test-building.glb"
        ok = glb_path.exists() and glb_path.read_bytes() == FAKE_GLB
    print("glb written correctly:", ok)

    # 验证 health
    print("health:", generator.health())

    server.shutdown()
    print("MOCK E2E PASS" if ok and asset == "/assets/generated/test-building.glb" else "MOCK E2E FAIL")


if __name__ == "__main__":
    main()
