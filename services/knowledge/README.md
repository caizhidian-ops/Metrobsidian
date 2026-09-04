# `services/knowledge`

Local FastAPI service for read-only folder scanning, upload parsing, lightweight classification, reviewable placements, and optional building generation orchestration.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
npm run service:knowledge
```

The service listens on `127.0.0.1:8000`. Data defaults to `services/knowledge/data/`, which is ignored by Git.

`LKS_ALLOWED_ROOTS` controls which local directories can be selected. It uses `:` between paths on macOS/Linux and `;` on Windows. The default permits only `content/demo-knowledge-base`.

## Main API groups

- `/api/files/upload` — archive and classify one uploaded file.
- `/api/sources/*` — authorize and scan local folders.
- `/api/placements/*` — confirm, correct, or reject suggested locations.
- `/api/buildings/*` — list buildings and their confirmed documents.
- `/api/building-genesis/*` — preview and run optional generated-building jobs.

Run tests from the repository root with `npm run test:python`. HTTP end-to-end scripts under `tests/test_e2e.py` and `tests/test_p1_novel.py` require a running service and an explicit `LKS_ALLOWED_ROOTS` value.

Design context: [`docs/knowledge-auto-classification-and-building-mapping.md`](../../docs/knowledge-auto-classification-and-building-mapping.md).
