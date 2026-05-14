# ADR-0001 — Detector / meter split

**Status:** Locked 2026-05-08
**Source:** `the-inverted-stack/.pao-inbox/_decisions/2026-05-08-prose-telemetry-platform.md`

## Context

Prose telemetry needs to support multiple measurement views over the same detection pass: per-1k-token density for cross-chapter comparison, per-paragraph dispersion for distribution analysis, drift-over-revisions for cull-pass validation. An earlier draft conflated detection and aggregation; CO's research-session feedback surfaced the cleaner split.

## Decision

Two distinct tools that compose:

- **Detector** — marks spans of stylistic devices in source prose. Emits `{type, span, offset, confidence, rule_or_model_id}` annotations.
- **Meter** — converts annotations into observability metrics. Emits `{raw_count, count_per_1k_tokens, sentence_coverage, paragraph_dispersion}` plus dimensions.

Storage discipline: raw annotations AND normalized metrics are both persisted, never metrics alone. New meters can be derived from stored annotations without re-running detectors.

JSON schema separates `detected_devices[]` (raw events) from `metrics[]` (normalized) from `dimensions` (OTel-style resource attributes: volume, act, chapter, voice-pass-status, author, genre, revision).

## Consequences

- Detector implementations evolve independently of meter logic — a new detector backend (rule, ML classifier, LLM) plugs into the same meters; a new meter view consumes the same detector output.
- Schema survives evolution: new metrics derive from stored events.
- Storage cost is higher (two parallel structures) but bounded and queryable.

## Notes

The OpenTelemetry parallel is exact. Detectors emit spans; meters compute metrics; dimensions are resource attributes; the document-level metrics (Flesch, sentence-length distribution) are orthogonal — they're document features, not device-specific.

See the original platform doc for the full schema example, OSS leverage table (Freestylo and StyloMetrix evaluated separately — see ADR-0003), and the original v1 detector list.
