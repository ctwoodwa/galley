"""Anadiplosis — last word of one sentence is the first word of the next.

Migrated from `prose_telemetry_handcount.py`. Skips article-leading
second sentences (peeks past "the / a / an / this / that / these /
those" to compare the next content word). Excludes a small stopword
list so common function words don't trigger false positives.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_LEADING_ARTICLES = {"the", "a", "an", "this", "that", "these", "those"}
_ECHO_STOPWORDS = {
    "have", "been", "this", "that", "with", "from", "they", "them",
    "their", "which", "would", "could", "should", "about", "there",
}


@register(
    name="anadiplosis",
    tier="stdlib",
    family="literary_device",
    description="Last word of one sentence echoed as first of the next.",
)
def detect_anadiplosis(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    sents = split_sentences(prose)
    findings: list[Finding] = []
    for i in range(len(sents) - 1):
        a_words = word_tokens(sents[i])
        b_words = word_tokens(sents[i + 1])
        if len(a_words) < 4 or len(b_words) < 2:
            continue
        last_a = a_words[-1].lower()
        first_b = b_words[0].lower()
        if first_b in _LEADING_ARTICLES and len(b_words) >= 2:
            first_b = b_words[1].lower()
        if last_a == first_b and len(last_a) >= 4 and last_a not in _ECHO_STOPWORDS:
            findings.append(
                Finding(
                    type="anadiplosis",
                    confidence=0.7,
                    rule_id="literary_device:anadiplosis.cross_sentence_echo",
                    extra={
                        "echo_word": last_a,
                        "first_sentence": sents[i],
                        "second_sentence": sents[i + 1],
                    },
                )
            )
    return findings
