# `apps/city`

The main Metrobsidian application: an explorable Three.js city backed by sanitized Markdown demonstration content.

## Run

```bash
npm install
npm run dev:city
```

Open `http://127.0.0.1:5173`.

Controls: drag to orbit, wheel to zoom, right-drag to pan, number keys to focus core districts, `R` or `Escape` to return to the city overview, and `Ctrl/⌘ K` to search.

## Structure

```text
apps/city/
├── index.html
├── <scene>.html
├── src/city/             # City map, navigation, knowledge, HUD
├── src/<scene>/          # Independent interior/experience modules
├── src/generator/        # Browser client for the optional local generator
└── public/assets/        # Licensed static assets; generated assets stay local
```

Add a scene by creating its HTML entry and `src/<scene>/` module, registering it in `vite.config.ts`, and declaring its route in `src/city/config/buildings.ts`. Do not route every scene through a single global `main.ts`.

Static knowledge is loaded from `content/demo-knowledge-base`. When `services/knowledge` is running, the application can hydrate from its API and ingest explicitly selected files.
