"""Antimetabole detector — same-word ABBA reversal within a span.

The literary-devices catalog (B11): "Compresses a thesis into a
memorable reversal. The reader registers the relationship as not-just-
symmetric but *bidirectional*." Distinct from chiasmus (which is
lemma-level ABBA) — antimetabole reuses the same surface words.

Detection: within a sentence (or across two adjacent sentences if
joined), find a content-word pair (A, B) such that:
  - A precedes B at one location
  - B precedes A at another location later in the span
  - Both pairs are within `max_distance` tokens of each other
  - A and B are not stopwords

Surface example: "We stopped asking what the cloud could do for our
data and started asking what our data could do without the cloud."
(`cloud` ... `data` ... `data` ... `cloud`)

Detection is intentionally precision-favoring over recall.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    split_sentences_with_spans,
)


_DEFAULT_MAX_DISTANCE = 40
_DEFAULT_MIN_WORD_LENGTH = 4

# Antimetabole stopwords — common short content words that often appear
# in reversed positions by coincidence and would create false positives.
_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "in", "on", "to", "for",
    "with", "by", "from", "as", "that", "this", "these", "those",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did",
    "i", "you", "he", "she", "it", "we", "they",
    "my", "your", "his", "her", "their", "its", "our",
    "not", "no", "yes", "so", "if", "but", "when", "where", "who",
    "what", "which", "would", "could", "should", "may", "might",
})

_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'-]*\b")


def _content_words(text: str, min_len: int) -> list[tuple[str, int]]:
    """Return (lowercased_word, token_index) for each content word."""
    out: list[tuple[str, int]] = []
    for i, m in enumerate(_WORD_RE.finditer(text)):
        w = m.group(0).lower()
        if len(w) < min_len or w in _STOPWORDS:
            continue
        out.append((w, i))
    return out


def _find_abba_in_text(
    text: str, min_word_length: int, max_distance: int
) -> list[tuple[str, str]]:
    """Find ABBA word-pair reversals within `text`. Returns the list of
    (word_a, word_b) pairs that exhibit the pattern.

    Algorithm: for every pair of distinct words A and B that each appear
    at least twice in `text`, check whether their first-occurrence order
    is reversed at some later occurrence.
    """
    words = _content_words(text, min_word_length)
    if len(words) < 4:
        return []

    # Index by lemma: word → list of token indices.
    by_word: dict[str, list[int]] = {}
    for w, i in words:
        by_word.setdefault(w, []).append(i)

    repeated = {w: idxs for w, idxs in by_word.items() if len(idxs) >= 2}
    if len(repeated) < 2:
        return []

    found: list[tuple[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    items = list(repeated.items())
    for i in range(len(items)):
        wa, ia = items[i]
        for j in range(i + 1, len(items)):
            wb, ib = items[j]
            # Need pattern: A...B...B...A within max_distance.
            # First-A index, find a B after it, find another B, find
            # another A after that.
            for a1 in ia:
                # B occurring after a1.
                bs_after = [b for b in ib if b > a1 and b - a1 <= max_distance]
                if not bs_after:
                    continue
                b1 = bs_after[0]
                # B occurring after b1 (the second B).
                bs_after_b1 = [b for b in ib if b > b1 and b - a1 <= max_distance]
                # A occurring after b1 (the second A).
                as_after_b1 = [a for a in ia if a > b1 and a - a1 <= max_distance]
                if bs_after_b1 and as_after_b1:
                    b2 = bs_after_b1[0]
                    a2 = min(a for a in as_after_b1 if a > b2) if any(
                        a > b2 for a in as_after_b1
                    ) else None
                    if a2 is not None and a2 - a1 <= max_distance:
                        pair = tuple(sorted((wa, wb)))
                        if pair not in seen_pairs:
                            seen_pairs.add(pair)
                            found.append((wa, wb))
                        break
    return found


@register(
    name="antimetabole",
    tier="stdlib",
    family="literary_device",
    description=(
        "Same-word ABBA reversal within a sentence (catalog B11). "
        "Distinct from chiasmus (lemma-level) — antimetabole reuses "
        "the literal surface words."
    ),
    metadata={
        "max_distance_default": _DEFAULT_MAX_DISTANCE,
        "min_word_length_default": _DEFAULT_MIN_WORD_LENGTH,
        "catalog_id": "B11",
    },
)
def detect_antimetabole(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    max_dist = int(config.extra.get("max_distance", _DEFAULT_MAX_DISTANCE))
    min_len = int(config.extra.get("min_word_length", _DEFAULT_MIN_WORD_LENGTH))

    findings: list[Finding] = []
    for sentence, start, end in split_sentences_with_spans(prose):
        pairs = _find_abba_in_text(sentence, min_len, max_dist)
        for word_a, word_b in pairs:
            findings.append(
                Finding(
                    type="antimetabole",
                    confidence=0.75,
                    rule_id="device:antimetabole",
                    span=(start, end),
                    text=sentence,
                    extra={
                        "family": "literary_device",
                        "catalog_id": "B11",
                        "word_a": word_a,
                        "word_b": word_b,
                    },
                )
            )
    return findings
