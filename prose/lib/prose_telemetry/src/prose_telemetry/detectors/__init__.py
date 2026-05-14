"""Detector packs for galley/prose.

Each sub-package houses one family of detectors:

- `anti_ai_lexical/` — regex-driven lookup detectors for the anti-AI-tells
  catalog. One LexicalLookupDetector class + N yaml data files; each
  yaml registers as its own named detector via the central registry.

Future sub-packages (added in later phases):

- `anti_ai_structural/` (Phase 6) — markdown-AST-driven detectors:
  -ing tail-phrases, rule-of-three density, false ranges, inline-header
  bullets, title-case headings, fragmented headers.
- `literary_devices/` (Phase 5) — spaCy-tier mid-complexity devices:
  epistrophe, symploce, antimetabole, hypophora, erotema, prolepsis,
  concession, distinctio, definition-by-negation.
- `sonics/` (Phase 3) — phoneme-level alliteration / assonance /
  consonance via the `pronouncing` library + CMU dict.
"""
