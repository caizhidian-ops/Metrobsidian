# `services/agent`

Restricted local task runtime used by Metrobsidian's visible agents. It can read a bounded set of project text files, create or copy approved text files, run a small verification allowlist, and persist Markdown task traces under `agents/`.

```bash
cp .env.example .env.local
npm run service:agent
```

It listens on `127.0.0.1:8790`. The runtime rejects project escapes, protected directories, binary files, deletion, and unapproved commands. It remains a development prototype and must not be exposed as an internet service.
