"""Proximity echo — content word echoed within ≤12 tokens in one sentence.

Migrated from `prose_telemetry_handcount.py`. Catches same-sentence
content-word repeats the cross-sentence detectors miss. Stopwords
ship as detector defaults — generic English function words plus
high-frequency content words that recur naturally in narrative.

Configurable:
  - `max_distance` (int, default 12)  — max token gap to flag.
  - `min_word_len` (int, default 5)   — minimum content-word length.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_DEFAULT_STOPWORDS = frozenset({
    # Function words / auxiliaries / common modifiers
    "have", "been", "this", "that", "with", "from", "they", "them",
    "their", "which", "would", "could", "should", "about", "there",
    "than", "then", "when", "what", "where", "while", "after", "before",
    "into", "over", "under", "only", "even", "much", "many", "some",
    "very", "just", "also", "always", "never", "still", "every",
    "because", "though", "since", "until", "however", "therefore",
    "other", "another", "same", "such", "those", "these",
    # High-frequency content words that recur naturally in narrative
    "thing", "things", "kind", "part", "place", "time", "times",
    "matter", "people", "person", "year", "years", "minute", "minutes",
    "hour", "hours", "morning", "evening", "night", "today",
    "first", "second", "third", "last", "next", "three", "four", "five",
    "good", "well", "back", "down", "again", "around", "between",
    "took", "made", "gave", "kept", "knew", "said", "told", "went",
    "came", "saw", "got", "let", "put", "set", "had", "did", "was",
    "were", "wanted", "needed", "tried", "found", "left", "asked",
    "called", "began", "started", "stopped", "looked", "turned",
    # Common to-be / aux forms in -ing
    "going", "coming", "making", "saying", "doing", "looking", "thinking",
    "knowing", "having", "being", "trying", "telling", "asking",
    # Common adjectives that recur naturally
    "more", "less", "most", "least", "few",
})


@register(
    name="proximity_echo",
    tier="stdlib",
    family="literary_device",
    description="Content word repeated within ≤12 tokens in one sentence.",
)
def detect_proximity_echo(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    max_distance = int(config.extra.get("max_distance", 12))
    min_word_len = int(config.extra.get("min_word_len", 5))
    stopwords = _DEFAULT_STOPWORDS | {w.lower() for w in config.stopwords}

    findings: list[Finding] = []
    for sent in split_sentences(prose):
        toks = word_tokens(sent)
        seen: dict[str, int] = {}
        for pos, w in enumerate(toks):
            wl = w.lower()
            if len(wl) < min_word_len:
                continue
            if wl in stopwords:
                continue
            # Skip proper nouns (capitalized mid-sentence).
            if pos > 0 and w[0].isupper() and w[0].isalpha():
                continue
            if wl in seen:
                distance = pos - seen[wl]
                if distance <= max_distance:
                    findings.append(
                        Finding(
                            type="proximity_echo",
                            confidence=0.75,
                            rule_id="literary_device:proximity_echo.content_word_near_repeat",
                            extra={
                                "word": wl,
                                "distance_tokens": distance,
                                "sentence": sent[:200] + ("..." if len(sent) > 200 else ""),
                            },
                        )
                    )
            seen[wl] = pos
    return findings
