# Handcount vs Registry — Detector Audit

**Date:** 2026-05-14 · **Status:** informational (no pipeline changes)

Cross-references the 42 stdlib detectors in
`the-inverted-stack/build/prose_telemetry_handcount.py` against the 35
detectors auto-registered under
`galley/prose/lib/prose_telemetry/src/prose_telemetry/detectors/`.
Goal: identify where the two pipelines emit findings for the same
prose feature so future consolidation work knows what's redundant and
what's additive.

## TL;DR

- **Only 3 detectors are duplicated.** Of 42 handcount + 35 registry =
  77 total detectors, just 3 fire on the same conceptual feature:
  `filter_words`, `motif_overuse`, `self_referential_frame`.
- **The other 71 are non-overlapping.** 39 detectors are
  handcount-only (Anna-calibrated stdlib heuristics); 32 are
  registry-only (Phase 2/3/5/6 additions plus the 10 yaml-driven
  anti-AI lexical detectors and proselint).
- The Phase 4 "Anna decoupling" plan in `ROADMAP.md` already
  designated the 3 overlapping detectors as **registry-replaces-
  handcount**; the registry versions read lists from `BookProfile`,
  the handcount versions have hardcoded Anna constants.
- **The duplication is small. The non-overlap is large.** The bigger
  story is that 39 valuable detectors don't yet honor the editorial
  overlay — they're not in the registry, so `prosePreset: strict`
  doesn't affect them. Migrating them is real Phase 8 work but it's
  pure mechanical translation, not algorithmic.

## Overlapping detectors (3)

For each, the registry version is the intended successor. Both pipes
fire today; consumers see two findings for the same prose feature.

| Conceptual detector | Handcount fn → type | Registry name | Config source — registry | Config source — handcount |
|---|---|---|---|---|
| Narrator-distance verbs | `detect_filter_words` → `filter_word` | `filter_words` (voice) | `BookProfile.detectors.filter_words.filter_words` (per-book list) | Hardcoded `_FILTER_VERBS` regex in handcount |
| Motif retired / capped lists | `detect_motif_overuse` → `motif_overuse` | `motif_overuse` (voice) | `BookProfile.detectors.motif_overuse.retired_motifs` + `.motifs` (per-book) | Hardcoded `_RETIRED_MOTIFS` + `_MOTIFS` in handcount |
| Self-referential staff-history frames | `detect_self_referential_frame` → `self_referential_frame` | `self_referential_frame` (voice) | `BookProfile.detectors.self_referential_frame.self_referential_frames` (per-book) | Hardcoded `_SELF_REF_FRAMES` regex in handcount |

**Consolidation recommendation:** retire the handcount versions. The
registry versions are multi-book ready and overlay-aware; the
handcount versions only work for the-inverted-stack and ignore the
preset. This is a 3-detector deletion in `prose_telemetry_handcount.py`
plus a smoke-test that the registry findings match the expected counts
on a known chapter.

## Handcount-only detectors (39)

Run via the book repo's handcount script. Findings appear under the
output JSON's top-level `detected_devices` and `metrics` keys. Today
they ignore `BookProfile`; thresholds are hardcoded in the handcount
script and in `cli.py`'s rollup. The editorial overlay does not
affect them.

Anti-AI / repetition / register:
- `anaphora`, `internal_anaphora`, `tautological_self_equation`,
  `echo_and_confirm`, `proximity_echo`, `confirmation_tag`,
  `inference_cascade`, `bigram_chain_loop`, `trigram_chain_loop`,
  `lexical_chain_loop`, `paragraph_opener_repeats`,
  `statement_then_reversal`, `epanorthosis`, `redundant_phrase`,
  `anadiplosis`

Density / structure:
- `parenthetical_density`, `fragment_density`, `paragraph_length_anomaly`,
  `modal_verb`, `vague_quantifier`, `abstract_noun`, `adverb_ly`,
  `said_tag`, `cliche`

Classical rhetoric:
- `asyndeton`, `polysyndeton`, `literal_tricolon`

Grammar / mechanics:
- `passive_voice`, `expletive_construction`, `conjunction_start`,
  `conjunctive_adverb`, `double_negative`, `comma_splice`,
  `infinitive`, `gerund`, `proper_noun`

Scene / chapter conventions:
- `direct_address`, `timestamp`, `temporal_marker`

**Migration cost estimate:** ~39 detectors × ~30 lines apiece + tests
≈ 2-3 dev days. No algorithmic change required — translate the
hardcoded constants into `DetectorConfig` fields and register through
the `@register(...)` decorator. Once migrated, each will honor the
editorial overlay's preset scaling.

## Registry-only detectors (32)

Already overlay-aware. Configured via `BookProfile.detectors[name]`
when the yaml supplies a config; otherwise informational.

- **literary_device / stdlib (12)** — `antimetabole`, `climax`,
  `concession`, `definition_by_negation`, `distinctio`, `epistrophe`,
  `erotema`, `hypophora`, `litotes`, `prolepsis`, `simile`, `symploce`.
  Phase 5/6 additions.
- **anti_ai / structural (6)** — `false_ranges`, `fragmented_headers`,
  `ing_tail_phrases`, `inline_header_bullets`, `rule_of_three_overuse`,
  `title_case_headings`. Phase 6.
- **anti_ai / lexical (10)** — yaml-driven lookups:
  `ai_vocab_cluster`, `collaborative_artifact`, `copula_avoidance`,
  `generic_positive_conclusion`, `knowledge_cutoff_disclaimer`,
  `persuasive_authority_trope`, `significance_puffery`, `signposting`,
  `travel_brochure`, `vague_attribution`. Phase 2.
- **sonics / stdlib (3)** — `alliteration`, `assonance`, `consonance`.
  Phase 3.
- **proselint (1 orchestrator)** — wraps the proselint library's
  ~250 sub-checks under one registry entry. Phase 3.

## Recommended next moves (informational)

1. **Retire the 3 handcount duplicates.** Smallest, highest-leverage
   change — closes the only real "double-finding" issue and removes
   the only cases where the editorial preset is silently bypassed for
   a feature that also exists in registry form.
2. **(Phase 8 candidate) Migrate the 39 handcount-only detectors to
   the registry**, one family at a time. Each migrated detector starts
   honoring the editorial overlay. Pure mechanical work; high test
   coverage already exists for the registry pattern.
3. **(Phase 8 candidate) Move the 4 spaCy-tier detectors** (`isocolon`,
   `distributed_chiasmus`, `nominalizations`, `antithesis`) into the
   registry. They currently run via `analyze_chapter()` and don't
   honor `BookProfile`. Smaller than #2 — 4 detectors.
4. **Update the dashboard / book-repo Makefile consumers** to read
   `registry_pipeline.verdict` alongside the legacy `rollup`. Without
   this, the verdict drift from editorial-overlay scaling is in the
   JSON but not surfaced to the user.
