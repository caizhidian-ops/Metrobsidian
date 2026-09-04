# Metrobsidian

[中文说明](./README.zh-CN.md)

> Turn files, notes, and local AI agents into a city you can enter.

Metrobsidian is a local-first 3D knowledge-space prototype built with Three.js. It turns Markdown folders into an explorable city: knowledge categories become districts, documents become objects you can open, and local agents can move through the same spatial model to read, summarize, and organize information.

![Metrobsidian city preview](./apps/city/preview.png)

## Why it exists

Conventional knowledge tools flatten everything into lists, folders, and search results. Metrobsidian tests a different interface: stable places, spatial relationships, visible growth, and agents whose work has a location and trace.

The repository demonstrates four ideas:

- **Knowledge as place** — buildings, districts, a minimap, and search provide multiple ways to navigate the same material.
- **Local-first ingestion** — a FastAPI service scans explicitly authorized folders or receives uploads without modifying source files.
- **Scene-based architecture** — the city and interior spaces are independent Vite entry points instead of one global scene controller.
- **Agents in the world** — local agents can read restricted project context, keep Markdown task traces, and expose progress through the 3D interface.

## Architecture

```text
Metrobsidian/
├── apps/
│   ├── city/                 # Main Three.js knowledge city
│   └── office/               # Office and laboratory scenes
├── services/
│   ├── knowledge/            # FastAPI ingestion and classification
│   ├── generation/           # Optional image → 3D provider adapter
│   ├── agent/                # Restricted local agent runtime
│   └── collaboration/        # Local WebSocket presence prototype
├── content/
│   └── demo-knowledge-base/  # Rewritten, sanitized demonstration notes
├── docs/                     # Architecture and product notes
└── serve-deep-city.mjs       # Integrated production-build preview
```

Browser applications are static Vite builds. Every optional service binds to `127.0.0.1` by default and is not required to explore bundled demonstration content.

## Quick start

Requirements: Node.js `22.12+`, npm `10+`, and a browser with WebGL enabled.

```bash
npm install
npm run dev:city
```

Open `http://127.0.0.1:5173`.

The company interior is a separate application. Run it in another terminal:

```bash
npm run dev:office
```

It opens at `http://127.0.0.1:5174/office.html`. In production-preview mode both applications share one origin:

```bash
npm run build
npm run serve
```

Open `http://127.0.0.1:5190`.

## Optional local services

Copy the environment template before enabling local services:

```bash
cp .env.example .env.local
```

Install the knowledge-service dependencies:

```bash
python3 -m venv services/knowledge/.venv
source services/knowledge/.venv/bin/activate   # Windows: services\knowledge\.venv\Scripts\activate
pip install -r services/knowledge/requirements.txt
```

Then start only what you need:

```bash
npm run service:knowledge       # 127.0.0.1:8000
npm run service:generation      # 127.0.0.1:8788
npm run service:collaboration   # 127.0.0.1:8787
npm run service:agent           # 127.0.0.1:8790
```

Provider-backed generation and agent calls are optional. Credentials remain in `.env.local`; never expose these local services to an untrusted network.

## Validation

```bash
npm test
npm run build
npm run check:public
```

CI runs Node tests, Python tests, both production builds, and the public-release scanner.

## Content and privacy boundary

`content/demo-knowledge-base/` contains rewritten demonstration material, not a raw personal archive. Do not commit customer files, precise addresses, account identifiers, private logs, local databases, raw uploads, or secrets. New public examples must be reviewed as publishable source material rather than merely “masked originals.”

Read [`SECURITY.md`](./SECURITY.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md), and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) before extending the repository.

## Status

Metrobsidian is a research prototype, not a hosted multi-tenant product. Current work focuses on reducing interaction weight, clarifying service boundaries, and testing when spatial organization is genuinely better than folders and search.

See [`ROADMAP.md`](./ROADMAP.md).

## License

Source code is released under the [MIT License](./LICENSE). Bundled third-party assets retain their original licenses.
