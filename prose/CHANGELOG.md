# prose — changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Phase 1 — Foundation (planned)
- `lib/_common/` types: `Finding`, `DetectorConfig`, `BookProfile`, `Verdict`
- Detector autodiscovery registry
- Non-book test fixtures (`non_book_a`, `non_book_b`)
- Vendor `prose_telemetry_handcount` into `lib/prose_telemetry/handcount/`

## [0.1.0] — 2026-05-14

### Added — Phase 0: Structural promotion
- Created `galley/prose/` as first-class tool family within galley.
- Promoted `prose_telemetry` and `story_canon` from `galley/lib/` to `galley/prose/lib/`.
- License changed from `Proprietary — galley` to MIT (galley-wide).
- Seeded ADR trail in `docs/adrs/`: 0001 (detector/meter split), 0002 (galley as editorial home), 0003 (FreeStylo skipped), 0004 (MIT license), 0005 (prose as first-class tool family), 0006 (OpenAPI cross-stack), 0007 (Sunfish local-first editorial).
- Updated doc references in `the-inverted-stack/` to the new paths.

### Detector inventory carried forward (no logic changes)
- **38 stdlib detectors** in `prose_telemetry/handcount`: anaphora, internal_anaphora, tautology, asyndeton, polysyndeton, literal_tricolon, echo_and_confirm, lexical_chain, self_referential_frame, bigram_chain, motif_overuse, parenthetical_density, fragment_density, statement_then_reversal, filter_words, redundant_phrases, proximity_echo, confirmation_tag, inference_cascade, internal_anaphora, anadiplosis, modal_density, vague_quantifiers, abstract_nouns, adverbs, said_overuse, paragraph_length_anomaly, trigram_chain, passive_voice, expletive_constructions, conjunction_starts, conjunctive_adverbs, double_negatives, comma_splices, cliches, direct_address, timestamps, temporal_markers, paragraph_opener_repeats, proper_nouns, infinitives, gerunds, epanorthosis. Plus verdict layer, held-lines mechanism, meters (per-1k normalization, sentence_coverage_pct, max_run_length), document_metrics (word/sentence/paragraph counts, sentence-length p50/p90, longest sentence), lexical diversity (TTR, MATTR), sentence-starter entropy, attribution variety.
- **4 spaCy detectors** in `prose_telemetry/spacy_detectors.py`: `isocolon`, `distributed_chiasmus`, `antithesis_within_sentence`, `nominalization`.
- **4 extractors** in `story_canon`: dates, durations, ages, relationships.
- **3 validators** in `story_canon`: age conflict, duration-date math, relationship inventory.
- **`numwords`** helper: parse spelled-out cardinals and ordinals.

### Migration notes
- No detector logic changed. JSON output schema unchanged.
- Book repo's `the-inverted-stack/build/prose_telemetry_handcount.py` stays in place during Phase 0; relocates to `galley/prose/lib/prose_telemetry/handcount/` in Phase 1.
- Book repo's `build/prose_telemetry_{corpus,dashboard,diff,vale_export}.py` stay in place during Phase 0; relocate to `galley/prose/apps/` in Phase 8.
