"""Trigram chain loop — phrase-level (3-word) repetition.

Migrated from `prose_telemetry_handcount.py`. Per-paragraph 3-gram
count with a density-aware threshold:
`max(min_repeats, max(2, paragraph_word_count / 150 + 1))`.

Stopword model: `_GENERIC_TRIGRAMS` shipped as defaults. Book-specific
trigrams come from `DetectorConfig.extra['stopword_trigrams']` as a
list of [w1, w2, w3] triples.

Configurable threshold:
  - `min_repeats` (int, default 3) — minimum trigram repeats to flag.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_GENERIC_TRIGRAMS = frozenset({
    ("one", "of", "the"), ("the", "rest", "of"), ("part", "of", "the"),
    ("in", "the", "way"), ("at", "the", "same"), ("for", "the", "first"),
    ("in", "the", "case"), ("by", "the", "way"), ("on", "the", "other"),
    ("the", "other", "hand"), ("in", "the", "end"), ("at", "the", "end"),
})


@register(
    name="trigram_chain_loop",
    tier="stdlib",
    family="literary_device",
    description="Three-word phrase repeated past density threshold in one paragraph.",
)
def detect_trigram_chain(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_repeats = int(config.extra.get("min_repeats", 3))

    extra_trigrams = config.extra.get("stopword_trigrams", []) or []
    book_trigrams = {tuple(t) for t in extra_trigrams if len(t) == 3}
    stopword_trigrams = _GENERIC_TRIGRAMS | book_trigrams

    findings: list[Finding] = []
    for para in prose.split("\n\n"):
        para = para.strip()
        if not para or len(para) < 120:
            continue
        words = [w.lower() for w in word_tokens(para)]
        threshold = max(2, int(len(words) / 150) + 1)
        trigrams = list(zip(words, words[1:], words[2:]))
        counts = Counter(tg for tg in trigrams if tg not in stopword_trigrams)
        for tg, n in counts.items():
            if n >= max(threshold, min_repeats):
                findings.append(
                    Finding(
                        type="trigram_chain_loop",
                        confidence=0.85,
                        rule_id="literary_device:trigram_chain.phrase_repeat_in_paragraph",
                        extra={
                            "trigram": " ".join(tg),
                            "count": n,
                            "paragraph_word_count": len(words),
                            "paragraph_excerpt": para[:140] + ("..." if len(para) > 140 else ""),
                        },
                    )
                )
    return findings
