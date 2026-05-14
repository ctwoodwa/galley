# ADR-0003 — FreeStylo skipped

**Status:** Locked 2026-05-14
**Source:** FreeStylo evaluation spike (2026-05-14 session)

## Context

The 2026-05-08 platform doc proposed Freestylo (JOSS-published, peer-reviewed) as the v1 detector engine, citing it as a path to "composition rather than from-scratch construction" with an estimated 3–5 day integration. A spike was opened to validate this premise before Phase 5 work begins.

## Decision

Do not integrate FreeStylo as a galley dependency.

Two grounds, either of which is sufficient:

1. **License.** FreeStylo is GPL-3.0. Galley is MIT (ADR-0004). Direct linkage propagates copyleft; subprocess-isolation is legally defensible but operationally costly. Permissive alternatives exist for every device FreeStylo provides except metaphor.
2. **Coverage.** FreeStylo ships 5 devices total: alliteration (rule-based), chiasmus (ML classifier), epiphora/epistrophe (rule-based), metaphor (PyTorch transformer), polysyndeton (rule-based). Of these:
   - 2 overlap detectors already in galley (`distributed_chiasmus`, `polysyndeton`).
   - 2 are rule-based devices trivially writeable in ~30 lines each (alliteration via `pronouncing` + CMU dict; epistrophe as mirror-of-anaphora).
   - 1 (metaphor) is genuinely hard, but belongs to the GPU/LLM tier already deferred to Phase 9.

Net new from FreeStylo: 3 devices, 1 of which is non-trivial. The integration cost (Python 3.12 forced upgrade, ~600 MB `_lg` spaCy models, bridging FreeStylo's `TextObject` type system to galley's `Finding` schema, undocumented custom-detector extension pattern, pre-trained classifier downloads) is not justified.

## Consequences

- Phase 5 ships 9 custom spaCy detectors as planned — no upstream dependency on FreeStylo.
- Alliteration / epistrophe are written in galley as part of Phase 3 / Phase 5.
- Metaphor detection — when CO confirms it's a real priority — re-evaluates FreeStylo's PyTorch model behind an HTTP service boundary (`galley/apps/api/` per ADR-0007). The GPL-3.0 boundary would be enforced by network isolation, not linkage.

## Notes

A separate StyloMetrix license check is open. StyloMetrix's 114 stylometric features (tense × aspect × modality permutations, pronoun distributions, clause-subordination ratios) do not overlap the literary-devices or anti-AI-tells gap; its potential value is in Phase 9 voice-fingerprinting / corpus-comparison work, not the Phase 1–6 catalog work.

**Do-not-repeat:** packages titled as "stylistic device detection" tend to over-promise from their titles and under-deliver on actual device coverage. Always pull the README's enumerated device list before scoping integration work.
