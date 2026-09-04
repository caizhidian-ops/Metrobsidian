# Security Policy

## Supported version

The latest commit on `main` is the only supported development version.

## Reporting a vulnerability

Do not open a public issue for credentials, path traversal, local-file exposure, arbitrary file writes, command execution, or paid-provider abuse. Report the problem privately through the repository owner's GitHub contact channel and include reproduction steps, affected files, and impact.

## Local-service model

Metrobsidian's knowledge, generation, agent, and collaboration services are development prototypes. They bind to `127.0.0.1` by default and are not hardened internet services. Keep that boundary intact unless you add authentication, transport security, origin restrictions, rate limits, authorization, and deployment isolation.

`.env.local`, local databases, uploads, generated task traces, and provider credentials must never be committed. Rotate any credential that may have entered a commit, log, screenshot, artifact, or shared archive.
