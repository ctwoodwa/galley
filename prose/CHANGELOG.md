# prose — changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Phase 3 — proselint + sonics (planned)
- proselint integration (BSD-3); dedup against own detectors
- Alliteration / assonance / consonance via `pronouncing` + CMU dict

### Phase 2 — High-yield additions (2026-05-14)

**Aggregates** (`lib/prose_telemetry/src/prose_telemetry/aggregates/`):
- `readability.py` — textstat wrappers: Flesch reading ease, Flesch-Kincaid
  grade, ARI, Gunning Fog, Coleman-Liau, SMOG, Dale-Chall, syllable counts,
  mean syllables per word. `attach_to_document_metrics()` for non-
  destructive merge into existing document_metrics dicts.
- `rhythm.py` — sentence-length CV (σ/μ of word counts per sentence),
  em-dash density per paragraph (literal `—` and spaced ` -- ` forms),
  dialogue/narration ratio (quote-marker heuristic matching the legacy
  handcount `_is_dialogue`).

**Markdown AST** (`markdown_ast.py`):
- markdown-it-py wrapper. `parse_blocks(markdown)` returns typed `Block`s
  (heading, paragraph, code, list_item, html, frontmatter, blockquote,
  thematic_break). `extract_prose(markdown)` strips code fences and
  frontmatter for detector consumption. Inline-header bullets (anti-AI
  tells #16) flagged via AST inspection, handling both `**Key:**` (colon
  inside bold) and `**Key**:` (colon after bold).

**Anti-AI lexical detector pack**
(`lib/prose_telemetry/src/prose_telemetry/detectors/anti_ai_lexical/`):
- `LexicalLookupDetector` class — generic regex-driven detector loaded
  from a yaml file. Single implementation; per-pattern data lives in yaml.
- 10 yaml patterns (one detector each) auto-register on package import:
  - `significance_puffery` — "stands as a testament", "pivotal moment", etc.
  - `travel_brochure` — "boasts", "vibrant ecosystem", "seamless", "intuitive"
  - `vague_attribution` — "experts argue", "industry observers", "it is widely believed"
  - `ai_vocab_cluster` — "delve into", "showcase", "tapestry", "interplay" (low confidence)
  - `copula_avoidance` — "serves as a", "stands as a", "represents a", "embodies"
  - `collaborative_artifact` — "I hope this helps", "Certainly!", chatbot residue
  - `knowledge_cutoff_disclaimer` — "as of my last training", "based on available information"
  - `generic_positive_conclusion` — "future looks bright", "exciting developments ahead"
  - `persuasive_authority_trope` — "the real question is", "at its core", "fundamentally"
  - `signposting` — "let's dive in", "here's what you need to know"

**Tests** (`tests/test_readability.py`, `test_rhythm.py`,
`test_markdown_ast.py`, `test_anti_ai_lexical.py`):
- 50 new tests covering aggregates, markdown AST, and the 10-detector pack.
- Combined with Phase 1 canary: 65/65 tests pass.

**Dependencies added** (`prose_telemetry/pyproject.toml`):
- `pyyaml >=6` (for yaml-driven detectors)
- `textstat >=0.7` (MIT; transitively pulls pyphen — tri-licensed
  GPL/LGPL/MPL-1.1, treated under MPL-1.1, compatible with galley MIT)
- `markdown-it-py >=3` (MIT)

### Phase 1 — Foundation (2026-05-14)
- `lib/_common/` types: `Finding`, `DetectorConfig`, `ComputeConfig`,
  `BookProfile`, `Verdict`. All plain dataclasses; yaml round-trip via
  `BookProfile.from_yaml/from_dict`.
- Detector autodiscovery registry: `@register` decorator, `get(name)`,
  `discover(family=, tier=)`.
- `books/_schema.yaml` JSON Schema + `books/the-inverted-stack.yaml`
  first-customer profile stub + `books/README.md`.
- `tests/conftest.py` shared fixtures + `tests/fixtures/non_book_a/` &
  `non_book_b/` with their own book.editorial.yaml profiles +
  `tests/test_canary.py` (15 tests, all pass).

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
