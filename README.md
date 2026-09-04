# Metrobsidian

> Turn files, notes, and AI agents into a city you can enter.

Metrobsidian is a local-first 3D knowledge-space prototype built with Three.js. It turns a folder of Markdown notes into an explorable city: knowledge categories become districts, documents become objects you can open, and local agents can move through the same spatial model to read, summarize, and organize information.

![Metrobsidian city preview](./apps/city/preview.png)

## What it demonstrates

- **Spatial knowledge navigation** — browse documents through buildings, districts, a minimap, and search instead of a conventional folder tree.
- **Local-first ingestion** — scan authorized local folders or upload files to a local FastAPI service; source files remain unchanged.
- **Extensible 3D scenes** — the city, home, school, hospital, construction site, canteen, gallery, office, and laboratory are independent scene entry points.
- **Agent-in-the-world interaction** — local agents can read restricted project context, keep task traces, and visualize progress inside the city.
- **Generative buildings** — an optional local pipeline can turn a prompt or uploaded knowledge cluster into an image, then a GLB asset.

This repository is an experimental reference implementation, not a hosted multi-tenant product. Local services are intentionally bound to loopback addresses by default.

## Architecture

```text
Metrobsidian/
├── apps/
│   ├── city/                 # Main Three.js knowledge city
│   └── office/               # Office and laboratory scenes
├── services/
│   └── knowledge/            # FastAPI ingestion and classification service
├── content/
│   └── knowledge-base/       # Sanitized demonstration knowledge
├── docs/                     # Product and interaction documents
├── package.json              # npm workspaces and root commands
└── serve-deep-city.mjs       # Integrated production-build preview server
```

The browser applications are static Vite builds. Optional Node and Python services run locally and are not required to explore the bundled demonstration content.

## Quick start

Requirements:

- Node.js `20.19+` or `22.12+`
- npm `10+`
- A browser with WebGL enabled

```bash
npm install
npm run dev:city
```

Open `http://localhost:5173`.

To run the office and laboratory app in parallel:

```bash
npm run dev:office
```

Open `http://localhost:5174/office.html`.

## Build and integrated preview

```bash
npm run build
npm run serve
```

Open `http://127.0.0.1:5190`.

## Optional local services

### Knowledge ingestion

```bash
cd services/knowledge
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The city falls back to bundled Markdown when this service is unavailable. See [`services/knowledge/README.md`](./services/knowledge/README.md) for its API and data model.

### Building generation and local agents

Copy the environment template before enabling provider-backed features:

```bash
cp .env.example .env.local
```

Never commit `.env.local` or provider credentials. Provider integrations are optional; the core city and demonstration content work without them.

## Repository boundaries

Public content in this repository is either source code, explicitly licensed third-party material, or rewritten demonstration data. Do not commit personal archives, customer material, precise addresses, account identifiers, API keys, generated task traces, local databases, or raw uploads.

See:

- [`SECURITY.md`](./SECURITY.md) for responsible disclosure and local-service precautions.
- [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for bundled asset attribution.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development and pull-request rules.

## Project status

Metrobsidian is a research prototype. Current priorities are simplifying scene ownership, making the local-service boundary explicit, and improving the mapping between knowledge structure and spatial interaction.

## License

Source code is released under the [MIT License](./LICENSE). Bundled third-party assets retain their original licenses; review [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) before redistribution.
