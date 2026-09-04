# Contributing

Metrobsidian is an experimental repository with a strict public-content boundary.

## Development flow

1. Create a focused branch.
2. Keep one pull request to one coherent capability or refactor.
3. Run `npm test`, `npm run build`, and `npm run check:public`.
4. Describe affected entry points, service boundaries, user-visible behavior, and validation.

## Scene rules

- Each scene owns its entry file, configuration, styles, objects, and interactions.
- The city coordinates navigation; it must not absorb every interior scene.
- Add new HTML entry points to the corresponding Vite `rollupOptions.input` map.
- Extract shared code only after at least two scenes use the same stable contract.

## Public-content rules

Do not commit raw personal archives, customer material, precise locations, account data, credentials, local databases, uploaded files, agent traces, or machine-specific paths. Use synthetic or substantively rewritten examples. Confirm redistribution rights for every image, model, font, audio file, and dataset.

## Service rules

Local services must bind to loopback by default. Any broader binding requires explicit documentation, origin controls, authentication where appropriate, and a security review.
