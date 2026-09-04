# `apps/office`

The company interior and laboratory connected to Metrobsidian's company district.

```bash
npm install
npm run dev:office
```

Open `http://127.0.0.1:5174/office.html`. The laboratory is at `/laboratory.html`.

This app is intentionally separate from `apps/city`: it has its own entry points, scene code, build, and assets. The integrated production preview maps `/office.html` and `/laboratory.html` to this build.

Public visual assets in this app are original procedural geometry, canvas textures, SVG studies, and a self-contained research-shelf page. No provider credentials or runtime uploads belong here.
