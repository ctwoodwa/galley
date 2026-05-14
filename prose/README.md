# prose

A tool family within galley for analyzing written prose: detector + meter pipeline producing chapter-level metrics, story-canon continuity validation, and editorial dashboards. Sibling to future `galley/speech/`, `galley/comics/`, and `galley/video/` tool families.

Built on the Sunfish local-first, self-hosted architecture. Detectors run on the user's machine by default. GPU-tier features route to user-controlled remote compute when configured. No third-party SaaS dependencies for core functionality.

## What's inside

| Path | Role |
|---|---|
| `lib/prose_telemetry/` | Python lib: literary-device detectors, anti-AI-tell catchers, document-level aggregates. Produces `<chapter>.prose-metrics.json`. |
| `lib/story_canon/` | Python lib: continuity validation against per-book canon yaml (dates, durations, ages, relationships; expanding in Phase 7 to places, objects, character-state). |
| `lib/narrative_continuity/` | *(Phase 7)* BookNLP-backed character clusters, quote attribution, event tagging. |
| `lib/voice_fingerprint/` | *(Phase 9 spike)* sentence-transformer embeddings for reference-corpus voice comparison. |
| `lib/_common/` | *(Phase 1)* shared types: `Finding`, `DetectorConfig`, `BookProfile`, `Verdict`. |
| `apps/cli/` | *(Phase 0.5)* `prose` command — `measure`, `validate`, `diff`, `dashboard` subcommands. |
| `apps/dashboard/` | *(Phase 8)* HTML renderer for `.prose-metrics.json`. |
| `apps/vale-bridge/` | *(Phase 8)* generator for Vale-compatible style rules. |
| `apps/corpus/` | *(Phase 8)* reference-corpus baseline tooling. |
| `books/` | Per-book profile registry: stopwords, motifs, thresholds, held-line locations, compute config. |
| `tests/fixtures/` | Detector validation: positive cases, negative cases, non-book canaries. |
| `tests/corpus/` | Reference-text snippets for voice-fingerprint comparison. |
| `docs/` | Architecture, integration, book-config schema, FOSS sourcing, ADR trail. |

## Quick start

```bash
cd galley/prose/lib/prose_telemetry
uv venv --python 3.11 .venv
source .venv/bin/activate
uv pip install -e .
python -m spacy download en_core_web_sm

# Measure a chapter against a book profile
python -m prose_telemetry measure path/to/chapter.md
```

A unified `prose` CLI lands in Phase 0.5 with `--book <id>` selecting a profile from `galley/prose/books/<book-id>.yaml`. A book repo can also ship its own `book.editorial.yaml` at its root; the CLI walks up the chapter's directory tree to find it.

## Architecture in one line

`Detectors emit Findings → Meters compute normalized Metrics → Verdict layer applies BookProfile thresholds → Exporters serialize to JSON / HTML / Vale rules.`

Detectors and meters are decoupled by design — see [ADR-0001](docs/adrs/0001-detector-meter-split.md). Local-first by default, with remote compute as an opt-in optimization — see [ADR-0007](docs/adrs/0007-sunfish-local-first-editorial.md). Cross-language clients via OpenAPI — see [ADR-0006](docs/adrs/0006-openapi-cross-stack.md).

## License

MIT, inherited from galley root [`../LICENSE`](../LICENSE).

## Pointers

- [`ROADMAP.md`](ROADMAP.md) — phase plan, budgets, current status
- [`CHANGELOG.md`](CHANGELOG.md) — version history
- [`docs/adrs/`](docs/adrs/) — architecture decision record trail (0001 through 0007 seeded in Phase 0)

Full architecture, integration, and book-config docs land in Phase 1 alongside the foundation work.
