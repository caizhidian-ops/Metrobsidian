# Architecture

Metrobsidian separates static browser applications, local services, and publishable demonstration content.

## Applications

`apps/city` owns the city, document navigation, scene entry points, and static fallback knowledge. `apps/office` owns the company interior and laboratory. They build independently and share one origin only through `serve-deep-city.mjs` after production builds.

## Services

`services/knowledge` is the source-ingestion boundary. `services/generation` owns paid provider calls. `services/agent` owns restricted file reading/writing and task traces. `services/collaboration` owns ephemeral WebSocket presence. No service is bundled into the browser.

## Content

`content/demo-knowledge-base` is publishable source material used at build time. Runtime uploads, databases, generated assets, and agent memories are ignored by Git and remain local.

## Dependency direction

Applications may call services through HTTP/WebSocket contracts. Services may write runtime assets into the city public directory when explicitly enabled. Publishable content does not depend on runtime state. The integrated preview server only serves built static files.
