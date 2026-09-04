# `services/generation`

Optional local adapter for prompt planning, image generation, and image-to-3D providers. Credentials remain server-side in the repository-root `.env.local` file.

```bash
cp .env.example .env.local
npm run service:generation
```

The service listens on `127.0.0.1:8788` and accepts browser requests only from configured `GEN_PROXY_ORIGINS`. Configure all provider URLs, model IDs, and keys explicitly; the public repository contains no working provider credentials.

Routes: `POST /prompt/plan`, `POST /t2i`, `POST /i2d/create`, `GET /i2d/poll`, and `GET /health`.
