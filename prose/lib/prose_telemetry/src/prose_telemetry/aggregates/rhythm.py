"""Rhythm aggregates for galley/prose.

Three metrics that the gap analysis flagged as missing from the existing
document_metrics:

- **sentence_length_cv**: coefficient of variation (σ/μ) of sentence
  word counts. Low cv (< 0.3) signals monotonous prose; high cv (> 1.3)
  signals chaotic alternation. Anna's expected band is 0.6–0.9.
- **em_dash_density_per_paragraph**: per-paragraph em-dash counts and
  derived stats. Em-dashes are intentional in this book's voice
  (Lencioni / Gladwell register), so the metric is informational — not
  a verdict trigger.
- **dialogue_narration_ratio**: estimated fraction of prose that is
  dialogue vs. narration, using the same `_is_dialogue` heuristic the
  legacy handcount script uses.

None of these are detector findings — they're chapter-level rollups for
inclusion in document_metrics. Verdict thresholds tied to them live in
BookProfile.detectors.<name>.
"""

from __future__ import annotations

import re
from statistics import StatisticsError, mean, pstdev
from typing import Any


# ─── Sentence segmentation (lightweight, shared across aggregates) ─────────

# Match end-of-sentence punctuation followed by whitespace and an
# uppercase letter. Same heuristic the legacy handcount script uses; not
# perfect for technical prose with abbreviations but sufficient for
# chapter-scale aggregation.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def _split_sentences(prose: str) -> list[str]:
    text = (prose or "").strip()
    if not text:
        return []
    return [s.strip() for s in _SENTENCE_END.split(text) if s.strip()]


# ─── Sentence-length coefficient of variation ──────────────────────────────


def compute_sentence_length_cv(prose: str) -> dict[str, Any]:
    """Return cv (σ/μ) of sentence word counts, plus context stats.

    `cv` is zero when fewer than two sentences are present (no variation
    to measure). Callers should special-case this in the verdict layer.

    Anna's expected band: 0.6–0.9. Below 0.3 = monotone (warning);
    above 1.3 = chaotic alternation (warning). These thresholds are
    book-specific and belong in BookProfile, not here.
    """
    sentences = _split_sentences(prose)
    if len(sentences) < 2:
        return {
            "cv": 0.0,
            "mean": 0.0,
            "stdev": 0.0,
            "sentence_count": len(sentences),
        }

    lengths = [len(s.split()) for s in sentences]
    m = mean(lengths)
    if m == 0:
        return {
            "cv": 0.0,
            "mean": 0.0,
            "stdev": 0.0,
            "sentence_count": len(sentences),
        }
    sd = pstdev(lengths)
    return {
        "cv": round(sd / m, 3),
        "mean": round(m, 2),
        "stdev": round(sd, 2),
        "sentence_count": len(sentences),
    }


# ─── Em-dash density per paragraph ─────────────────────────────────────────


# An em-dash can be a literal `—` glyph or the ASCII sequence ` -- ` /
# ` — ` (the latter is the most common rendered form). We count both
# literal glyphs and the spaced-double-hyphen render as one em-dash.
_EM_DASH_PATTERNS = [
    re.compile(r"—"),
    re.compile(r" — "),
    re.compile(r" -- "),
]


def _count_em_dashes(text: str) -> int:
    n = 0
    for p in _EM_DASH_PATTERNS:
        n += len(p.findall(text))
    # The spaced patterns can overlap with the literal `—` count if both
    # forms appear; deduplicate by treating the literal-glyph count as
    # authoritative when the spaced form's count is ≤ it.
    glyph = len(_EM_DASH_PATTERNS[0].findall(text))
    spaced_total = sum(len(p.findall(text)) for p in _EM_DASH_PATTERNS[1:])
    return max(glyph, spaced_total) if glyph else spaced_total or n


def compute_em_dash_density(prose: str) -> dict[str, Any]:
    """Return per-paragraph em-dash counts and derived stats.

    Paragraphs are split on blank lines (`\\n\\n`). Code fences and YAML
    front-matter are NOT stripped at this layer — callers wanting that
    should pre-process via markdown_ast.extract_prose().
    """
    text = (prose or "").strip()
    if not text:
        return {
            "total_em_dashes": 0,
            "paragraph_count": 0,
            "mean_em_dash_per_paragraph": 0.0,
            "max_em_dash_per_paragraph": 0,
            "paragraphs_with_4plus_em_dashes": 0,
        }

    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    counts = [_count_em_dashes(p) for p in paragraphs]
    total = sum(counts)
    return {
        "total_em_dashes": total,
        "paragraph_count": len(paragraphs),
        "mean_em_dash_per_paragraph": round(mean(counts), 3) if counts else 0.0,
        "max_em_dash_per_paragraph": max(counts) if counts else 0,
        "paragraphs_with_4plus_em_dashes": sum(1 for c in counts if c >= 4),
    }


# ─── Dialogue / narration ratio ────────────────────────────────────────────


# Same heuristic as the legacy handcount _is_dialogue: a sentence is
# dialogue if it starts or ends with a quote character (curly or straight).
_QUOTE_OPENERS = ('"', "“", "‘", "'")  # straight, curly-double, curly-single
_QUOTE_CLOSERS = ('"', "”", "’", "'")
# Sentence-end punctuation that may appear AFTER a closing quote in
# constructions like 'She said, "I will go."'. These get trimmed before
# checking for the trailing quote character.
_TRAILING_PUNCT = ".?!,;:"


def _is_dialogue_sentence(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    # Opens with a quote → dialogue.
    if s.startswith(_QUOTE_OPENERS):
        return True
    # Ends with a quote (possibly followed by sentence-end punctuation) →
    # dialogue. Strip trailing punctuation, then check.
    tail = s
    while tail and tail[-1] in _TRAILING_PUNCT:
        tail = tail[:-1].rstrip()
    return tail.endswith(_QUOTE_CLOSERS) if tail else False


def compute_dialogue_narration_ratio(prose: str) -> dict[str, Any]:
    """Estimate fraction of dialogue vs. narration at sentence granularity.

    `dialogue_ratio` is the proportion of sentences whose first or last
    character is a quote mark (per the existing handcount heuristic).
    `narration_ratio` is the complement. Both are in [0.0, 1.0].

    `unclassified_ratio` is reserved for future per-character speaker
    attribution work (Phase 7 BookNLP integration); currently always 0.
    """
    sentences = _split_sentences(prose)
    if not sentences:
        return {
            "dialogue_ratio": 0.0,
            "narration_ratio": 0.0,
            "unclassified_ratio": 0.0,
            "sentence_count": 0,
            "dialogue_sentence_count": 0,
        }

    dialogue_n = sum(1 for s in sentences if _is_dialogue_sentence(s))
    total = len(sentences)
    return {
        "dialogue_ratio": round(dialogue_n / total, 3),
        "narration_ratio": round((total - dialogue_n) / total, 3),
        "unclassified_ratio": 0.0,
        "sentence_count": total,
        "dialogue_sentence_count": dialogue_n,
    }


# ─── Convenience: all rhythm metrics in one call ───────────────────────────


def compute_rhythm(prose: str) -> dict[str, Any]:
    """Run all three rhythm aggregates and return a merged dict.

    Suitable for inclusion as `document_metrics["rhythm"] = compute_rhythm(prose)`.
    """
    return {
        "sentence_length": compute_sentence_length_cv(prose),
        "em_dash": compute_em_dash_density(prose),
        "dialogue": compute_dialogue_narration_ratio(prose),
    }
