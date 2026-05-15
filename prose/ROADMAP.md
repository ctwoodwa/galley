# prose — roadmap

Source plan: `the-inverted-stack/.pao-inbox/_decisions/` 2026-05-14 series (galley-recast, gap analysis, FOSS sourcing, master features list). Refined and locked across the 2026-05-14 session. Phases are atomic — work pauses cleanly at any phase boundary.

## Phases

| Phase | Scope | Budget | Gate | Status |
|---|---|---|---|---|
| **0 — Structural promotion** | Create `galley/prose/`; lift `prose_telemetry` and `story_canon` from `galley/lib/`; establish ADR trail; update doc refs in the-inverted-stack | 2d | Existing book pipeline produces identical metrics from the new path | ✅ |
| **0.5 — CLI shim** | `apps/cli/` wraps both libs; book repo's `Makefile` invokes `prose measure`, `prose validate` through wrappers | 0.5d | `make code-check ch=ch02` produces identical JSON to pre-migration | — |
| **1 — Foundation** | `lib/_common/types.py`, detector autodiscovery registry, `BookProfile` schema + loader, non-book test fixtures (`non_book_a`, `non_book_b`), vendor handcount into `lib/prose_telemetry/handcount/` | 2d | Registry discovers every detector; canary tests pass for inverted-stack + both non-book fixtures | — |
| **2 — High-yield additions** | textstat (Flesch/FK/ARI/Gunning/Coleman-Liau/SMOG/Dale-Chall, syllable counts); markdown-it-py wrapper; 10 anti-AI lexical detectors via `LexicalLookupDetector` (one class + 10 yaml data files); sentence-length CV, em-dash density, dialogue-narration ratio | 3d | New aggregates in metrics JSON; 10 anti-AI counts present; non-book fixture exercises all | — |
| **3 — proselint + sonics** | proselint integration (BSD-3); dedup proselint rules against own detectors; alliteration / assonance / consonance via `pronouncing` + CMU dict | 1.5d | proselint findings under their own subsection; alliteration fires on known fixture; no duplicate findings | — |
| **4 — Anna decoupling** | Lift 9 Anna-calibrated detectors (motif lists, filter-words, lexical-chain stopwords, self-referential frames, confirmation-tag regex, echo-and-confirm params) to `BookProfile`-loaded config; ship `the-inverted-stack.yaml` in `books/` | 1.5d | Inverted-stack profile preserves verdict on ch02; non-book profile produces different correct findings | ✅ |
| **5 — Mid-complexity devices** | 9 spaCy detectors: epistrophe, symploce, antimetabole, hypophora, erotema, prolepsis, concession, definition-by-negation, distinctio | 3d | Literary-devices catalog coverage rises 11/43 → ≥22/43 | ✅ (26/43) |
| **6 — Structural anti-AI + extras** | 6 markdown-AST detectors (`-ing` tail-phrases, rule-of-three density, false ranges, inline-headers, title case, fragmented headers); plus simile, litotes, climax/auxesis | 2d | Anti-AI tells coverage rises 2/29 → ≥16/29; literary-devices rises to ≥25/43 | ✅ (26/29; 26/43) |
| **6.5 — Registry into production dispatch** | `BookProfile.from_book_root` loads yaml + galley UI sidecar overlay; `dispatch.run_registry` iterates `discover()` and runs all 27+ registered detectors against chapter prose; `cli.py measure` adds the registry pass alongside handcount + spaCy and writes it under `registry_pipeline` in the output JSON. UI preset (`gentle`/`standard`/`strict`) scales thresholds via the overlay; activeVoice replaces profile.voice. | 1d | `prose measure` on inverted-stack ch02 produces a `registry_pipeline` section with ≥30 detectors firing; smoke-test confirms `.galley/editorial.json` overlay reaches the profile | ✅ |
| **6.6 — Verdict rollup for registry pipeline** | `verdict.rollup_registry(metrics, profile)` classifies each metric against `DetectorConfig` thresholds (density-exclusive when set, raw-count fallback) and returns a `Verdict` (red/yellow/green + blocker/warning/pass lists). Attached as `registry_pipeline.verdict` in the output JSON; printed in CLI summary. Editorial preset scaling shows up as threshold drift → verdict drift. | 0.5d | Verdict shape pinned by 9 unit tests; smoke-test confirms `prosePreset: strict` flips an inverted-stack chapter from green to red when tight per-detector thresholds are configured | ✅ |
| **7 — BookNLP + canon expansion** | Integrate BookNLP (MIT) as `lib/narrative_continuity/`: character clusters, coref, quote attribution, event detection, supersense, referential gender. Add story_canon validators: `place_consistency`, `object_inventory`, `name_spelling`, `character_on_stage`, `said_attribution_disambiguation`, `referential_gender_consistency` | 4d | BookNLP runs ch02 in < 2min; 6 new validators each fire on at least one constructed contradiction | 🚧 BLOCKED — see below |
| **7.5 — API surface scaffold** | `galley/apps/api/openapi.yaml` schema for prose endpoints (initially empty contract); `lib/_common/remote.py` Python HTTP client generated from the schema; `BookProfile.compute` block defined | 1d | OpenAPI spec passes validation; generated Python client imports; book yaml's compute block parses | — |
| **8 — Platform polish** | Move `prose_telemetry_dashboard.py`, `prose_telemetry_vale_export.py`, `prose_telemetry_corpus.py`, `prose_telemetry_diff.py` from book repo into `apps/`; update book's `Makefile` to invoke `prose` CLI for all editorial functions. Sub-task: migrate the remaining 28 handcount stdlib detectors to the registry, one family-batch at a time. `prose init` CLI now scaffolds book.editorial.yaml for new books. | 2-3d | Book repo `build/` shrinks to book-specific glue; all editorial tasks invoke `prose` CLI; handcount script retires entirely | 🚧 batches 0 (voice — 3) + 1 (classical rhetoric — 4) + 2a (repetition/echo — 4) + 2b (chain — 3) done; 28 remaining |
| **9 — Deferred spikes (post-MVP)** | (a) sentence-transformers voice fingerprinting for reference-corpus comparison; (b) StyloMetrix license verification + potential integration; (c) GPU/LLM-tier carve-out design (`galley/apps/api/` endpoints for metaphor, paradox, foreshadow, knowledge-state) | 1d each | Spike results filed as ADRs; implementation deferred until CO ear-tests Phase 6 output | — |

**Total P0–P8 budget: ~22.5 dev days.** P9 spikes are decision-only at this stage.

## Phase 7 blocker — Intel Mac + PyTorch wheel availability (2026-05-14)

Attempted BookNLP install in `galley/prose/lib/prose_telemetry/.venv`
(Python 3.11, macOS x86_64). The chain went:

- `booknlp` pulled `transformers >=5` (current 5.8.1).
- `transformers >=5` requires `torch >=2.4`.
- No `torch >=2.4` wheels are published for `macosx_*_x86_64` —
  PyTorch dropped Intel Mac wheels after the 2.2.x line. Apple Silicon
  (`macosx_*_arm64`), Linux x86_64, and Windows continue to receive
  builds.

Resolution paths (decide in next session, not blocking Phases 8/9):

1. **Pin BookNLP / transformers to versions that work with torch 2.2.x.**
   transformers 4.x supports torch 2.2 cleanly. Investigate whether
   BookNLP exposes a version pin combination that holds together.
2. **Run BookNLP behind a service boundary** (`galley/apps/api/`,
   matching the GPU-tier pattern in ADR-0007). The service runs on
   a machine with a PyTorch-compatible wheel; galley/prose calls it
   over HTTP. This is the path ADR-0006 (OpenAPI cross-stack) was
   designed to enable.
3. **Switch the venv to Apple Silicon** if a target machine is
   available. ARM Macs have current torch wheels.
4. **Defer Phase 7 entirely** in favor of Phases 7.5 + 8. The
   continuity-validator features Phase 7 was meant to enable can wait
   until the platform-level questions above are answered.

Phase 6 (and earlier) are unaffected — they have no torch dependency.
Phases 7.5 + 8 + 9 can proceed without resolving Phase 7.

The aborted BookNLP install left the venv with ~500 MB of unused deps
(tensorflow, transformers 5.x, torch 2.2.2, keras, huggingface-hub).
The existing test suite (165/165 pass) is unaffected; the next session
can decide whether to clean up the venv or work around.

## Currently locked decisions

| ADR | Decision |
|---|---|
| [0001](docs/adrs/0001-detector-meter-split.md) | Detectors emit annotations; meters compute normalized metrics. Decoupled lifecycle. |
| [0002](docs/adrs/0002-galley-as-editorial-home.md) | Editorial tooling consolidates in galley; book repo becomes consumer, not detector host. |
| [0003](docs/adrs/0003-freestylo-skipped.md) | FreeStylo not integrated — GPL-3.0 incompatible with permissive composition; coverage thin. |
| [0004](docs/adrs/0004-mit-license.md) | Galley relicensed from `Proprietary — galley` to MIT. |
| [0005](docs/adrs/0005-prose-first-class-tool-family.md) | `prose/` is first-class tool family within galley, sibling to future `speech/`, `comics/`, `video/`. |
| [0006](docs/adrs/0006-openapi-cross-stack.md) | OpenAPI schema is single source of truth; Python and TypeScript clients are generated artifacts. |
| [0007](docs/adrs/0007-sunfish-local-first-editorial.md) | Galley is a Sunfish editorial example — local-first, self-hosted, user-owned compute, no third-party SaaS. |

## First customer

`the-inverted-stack` — Anna's Filchner/Bobiverse-trial chapter prose. The book repo updates in Phase 0.5 to invoke `prose` CLI through `make` wrappers that preserve current targets.

## Sibling slots (reserved for future tool families)

- `galley/speech/` — TTS/STT-driven editing
- `galley/comics/` — comics production
- `galley/video/` — video production

Each follows the same internal pattern (`README` / `ROADMAP` / `docs` / `lib` / `apps` / `books` / `tests`). The `prose/` layout is the template.
