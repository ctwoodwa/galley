# ADR-0002 — Galley as editorial home (recast)

**Status:** Locked 2026-05-14
**Source:** `the-inverted-stack/.pao-inbox/_decisions/2026-05-14-prose-telemetry-galley-recast-upf` (this session's recast plan, ratified)

## Context

The 2026-05-08 platform doc committed to galley as the home for spaCy-tier detectors but left the stdlib tier in the book repo (`the-inverted-stack/build/prose_telemetry_handcount.py`, ~2,290 lines). The 2026-05-14 metric-improvements plan proposed adding four more detectors plus a verdict-layer rewrite — all inside that book-repo monolith. The recast surfaced that this entanglement actively works against the stated multi-book goal.

The AHA: detectors are corpus-agnostic; the verdict layer is corpus-specific. They should be factored apart.

## Decision

Editorial tooling consolidates inside galley. The book repo becomes a *consumer* of editorial, not the host of editorial logic.

- **Corpus-agnostic detectors** live in `galley/prose/lib/` (formerly `galley/lib/`, now under the prose tool family — see ADR-0005).
- **Corpus-specific calibration** (Anna's motif lists, filter-words, thresholds, held-lines) lives in per-book yaml profiles loaded by `BookProfile`. The book repo ships its own profile.
- **Existing handcount script** is vendored into galley as `lib/prose_telemetry/handcount/` in Phase 1. The book repo's wrappers continue to work via Phase 0.5 CLI shim.

## Consequences

- A second book consumes editorial by shipping its own profile yaml, not by forking the codebase.
- Detector evolution happens in galley; calibration tuning happens in the book repo. Clean separation.
- Phase A of the 2026-05-14 metric-improvements plan (density-normalized verdict thresholds) still ships in the book repo as planned — it is corpus-specific and stays with the calibration. Phases B–G of that plan are absorbed into this workstream's Phases 2–6.

## Notes

The 2026-05-08 platform doc's premise that "Freestylo + StyloMetrix is a viable starting stack" was reassessed in ADR-0003. Custom spaCy detectors remain the right path.

The book repo's `build/prose_telemetry_{corpus,dashboard,diff,vale_export}.py` move into `galley/prose/apps/` in Phase 8, after the detector consolidation stabilizes.
