"""Density / style detector pack — Phase 8 batch 4.

Ten detectors migrated from handcount covering paragraph-level density
metrics and word-level style markers:

  Per-paragraph:
    - parenthetical_density   — em-dash + paren appositions per sentence.
    - fragment_density        — consecutive runs of ≤4-word sentences.
    - paragraph_length_anomaly — over-4x or under-0.2x chapter mean.

  Lexical / regex:
    - redundant_phrase        — stock filler ("in order to", "the fact that").
    - modal_verb              — hedging modals (would / could / should …).
    - vague_quantifier        — weakening intensifiers (very / really / quite).
    - abstract_noun           — -tion / -ness / -ity / -ment / -ance suffixes.
    - adverb_ly               — -ly adverb density.
    - said_tag                — "he said / she replied" attribution overuse.
    - cliche                  — exact-match common fiction clichés.

All register under `family='literary_device', tier='stdlib'`.
"""

from prose_telemetry.detectors.density_style import (  # noqa: F401
    abstract_nouns,
    adverbs,
    cliche,
    fragment_density,
    modal_density,
    paragraph_length_anomaly,
    parenthetical_density,
    redundant_phrases,
    said_overuse,
    vague_quantifiers,
)

__all__ = [
    "abstract_nouns",
    "adverbs",
    "cliche",
    "fragment_density",
    "modal_density",
    "paragraph_length_anomaly",
    "parenthetical_density",
    "redundant_phrases",
    "said_overuse",
    "vague_quantifiers",
]
