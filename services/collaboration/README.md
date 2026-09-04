# `services/collaboration`

Minimal WebSocket prototype for room presence and temporary 3D pointer events.

```bash
npm run service:collaboration
```

It listens on `127.0.0.1:8787`, caps message size, validates room/user tokens and points, rate-limits pointer events, and restricts browser origins through `COLLAB_ORIGINS`. It has no persistent identity or authorization model and is not suitable for public deployment.
