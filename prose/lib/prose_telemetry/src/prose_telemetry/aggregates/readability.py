"""Readability aggregates via the textstat library.

textstat is MIT-licensed. It transitively depends on pyphen (tri-licensed
GPL-2.0+ / LGPL-2.1+ / MPL-1.1) for hyphenation; we treat pyphen under its
MPL-1.1 option, which is compatible with galley's MIT license. We do not
modify pyphen; we consume it as an unmodified library.

The exposed `compute_readability(prose)` returns a flat dict of metrics
suitable for the prose-metrics.json `document_metrics` section. Values
are floats (rounded to 2 decimal places); higher / lower interpretation
is metric-specific — see each metric's docstring.

Closes Phase 2 of galley/prose/ROADMAP.md (readability aggregates) — was
previously a notable absence per the gap analysis.
"""

from __future__ import annotations

from typing import Any

import textstat


def compute_readability(prose: str) -> dict[str, float]:
    """Compute all standard readability metrics for the given prose.

    Output keys (all floats unless noted):

    - `flesch_reading_ease`: 0–100. Higher = easier. ~60–70 = high-school
      reading level; <30 = very difficult; >90 = very easy.
    - `flesch_kincaid_grade`: U.S. school grade equivalent. 9.3 = ninth
      grader can read it.
    - `automated_readability_index` (ARI): similar grade scale to FK.
    - `gunning_fog`: years of formal education needed. 12 = high-school
      senior. Penalizes long words and long sentences.
    - `coleman_liau_index`: grade level. Character-based (not syllable-
      based), so consistent on technical / hyphenated terms.
    - `smog_index`: grade level. Targets fluent comprehension; tends to
      run ~2 grades higher than FK on the same prose.
    - `dale_chall_readability_score`: uses a controlled vocabulary list;
      ~4.9 = average 4th grader; ~9.9 = average college senior.
    - `syllable_count` (int-as-float): total syllables in prose.
    - `lexicon_count` (int-as-float): total words.
    - `mean_syllables_per_word`: complexity proxy.

    Designed for English prose. textstat supports other languages with
    language-specific parameters; galley/prose is English-first in
    Phase 2. Multilingual readability is deferred.

    Returns an empty dict if `prose` is empty or whitespace-only — saves
    callers from textstat's div-by-zero edge cases.
    """
    text = (prose or "").strip()
    if not text:
        return {}

    # textstat's helpers all consume a single str. We compute each metric
    # eagerly here so a downstream change to which metrics ship is a one-
    # line edit to this function rather than a refactor of every caller.
    lex = textstat.lexicon_count(text)
    syl = textstat.syllable_count(text)
    mean_syl = (syl / lex) if lex > 0 else 0.0

    return {
        "flesch_reading_ease": round(textstat.flesch_reading_ease(text), 2),
        "flesch_kincaid_grade": round(textstat.flesch_kincaid_grade(text), 2),
        "automated_readability_index": round(
            textstat.automated_readability_index(text), 2
        ),
        "gunning_fog": round(textstat.gunning_fog(text), 2),
        "coleman_liau_index": round(textstat.coleman_liau_index(text), 2),
        "smog_index": round(textstat.smog_index(text), 2),
        "dale_chall_readability_score": round(
            textstat.dale_chall_readability_score(text), 2
        ),
        "syllable_count": float(syl),
        "lexicon_count": float(lex),
        "mean_syllables_per_word": round(mean_syl, 3),
    }


def attach_to_document_metrics(
    document_metrics: dict[str, Any], prose: str
) -> dict[str, Any]:
    """Merge readability metrics into an existing document_metrics dict.

    Non-destructive — existing keys are preserved; readability keys are
    added under a `readability` subkey to keep the document_metrics
    top-level shape stable.
    """
    readability = compute_readability(prose)
    if readability:
        out = dict(document_metrics)
        out["readability"] = readability
        return out
    return document_metrics
