# ADR-0005 — `prose/` as first-class tool family within galley

**Status:** Locked 2026-05-14

## Context

Editorial telemetry had been living under `galley/lib/` as a Python subdirectory grafted onto galley's JS-dominant turbo monorepo. As the editorial gap analysis surfaced ~30 missing rhetorical devices, ~21 missing anti-AI tells, ~8 missing aggregates, and ~14 missing continuity validators — plus the fact that galley itself is positioned for future tool families covering speech, comics, and video — the question of where this work *belongs* surfaced.

Two alternatives considered:

- **`SunfishSoftware/editorial/`** as a new top-level peer to galley. Rejected: galley *is* the editorial platform; pulling editorial out and naming a sibling `editorial/` would be the project explaining itself to itself.
- **`galley/editorial/`** as a first-class peer to `apps/`, `packages/`, `services/`. Rejected: telemetry is one of many editorial tool families galley will accumulate (speech, comics, video are planned); naming the slot "editorial" claims the whole roof.

## Decision

Editorial telemetry lives at `galley/prose/` — a first-class tool-family directory inside galley.

The name `prose/` is medium-specific (vs. `editorial`, which is purpose-specific). Sibling slots are reserved for future families: `galley/speech/`, `galley/comics/`, `galley/video/`. Each family follows the same internal layout:

```
<family>/
├── README.md, ROADMAP.md, CHANGELOG.md
├── docs/{ARCHITECTURE,INTEGRATION,BOOK-CONFIG,FEATURES,FOSS-SOURCING,DETECTOR-AUTHORING}.md
├── docs/adrs/
├── lib/             — Python libraries (and any other lang as needed)
├── apps/            — family-specific CLI / dashboard / exporters
├── books/           — per-book profile registry
└── tests/           — fixtures + corpus
```

Cross-cutting concerns stay at galley root: `apps/api/` (HTTP routes for all families), `apps/web/` (the web reader consuming all families), `services/python-workers/` (heavy-compute workers per family), `packages/api-client/` (typed clients per family).

`galley/lib/` is removed as a top-level — its former contents now live under `galley/prose/lib/`.

## Consequences

- Prose has its own roadmap, ADR trail, and changelog independent of galley's other surfaces.
- A second book consumes `prose` (via CLI or library import) without depending on galley's audio, image, or video tooling.
- Galley's brand statement ("Editorial production platform for book publishing workflows") accurately describes the whole roof while each tool family has its own working identity.
- The 28-day workstream budget targets `prose/`; sibling families are entirely separate workstreams when they open.

## Notes

The `editorial-domain` JS package in `packages/editorial-domain/` remains a cross-cutting UI scaffold consumed by the web reader for editorial features across all tool families. It is the UI counterpart to the tool-family directories.

CLI binary naming: `prose measure ...` short-form for now. A `galley` meta-CLI dispatcher (`galley prose measure ...`, `galley speech align ...`) is reserved for when family count reaches 2+. Cheap to add then; presumptuous now.
