"""Bigram chain loop — phrase-level (2-word) repetition.

Migrated from `prose_telemetry_handcount.py`. Catches phrase loops the
single-word lexical detector misses (e.g. 'the staff history' as a
unit). Per-paragraph density threshold:
`max(3, paragraph_word_count / 100 + 2)`.

Stopword model: `_GENERIC_BIGRAMS` shipped as defaults. Book-specific
phrase bigrams come from `DetectorConfig.extra['stopword_bigrams']`
as a list of [w1, w2] pairs.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


# Generic English function-word bigrams — pure language-level glue.
# Book-specific phrase-level register lives in the yaml.
_GENERIC_BIGRAMS = frozenset({
    ("in", "the"), ("of", "the"), ("to", "the"), ("on", "the"),
    ("at", "the"), ("for", "the"), ("with", "the"), ("from", "the"),
    ("by", "the"), ("as", "the"), ("and", "the"), ("and", "i"),
    ("i", "had"), ("i", "have"), ("i", "was"), ("i", "am"),
    ("she", "had"), ("he", "had"), ("it", "was"), ("there", "was"),
    ("there", "were"), ("would", "have"), ("had", "been"),
    ("did", "not"), ("had", "not"), ("would", "not"), ("could", "have"),
    ("which", "was"), ("which", "is"), ("that", "i"), ("when", "i"),
    ("when", "the"), ("if", "i"), ("if", "you"), ("but", "i"),
    ("but", "the"), ("on", "a"), ("of", "a"), ("to", "a"), ("at", "a"),
    ("i", "did"), ("i", "do"), ("i", "would"), ("i", "could"),
    ("i", "knew"), ("i", "know"), ("i", "said"),
})


@register(
    name="bigram_chain_loop",
    tier="stdlib",
    family="literary_device",
    description="Two-word phrase repeated past density threshold in one paragraph.",
)
def detect_bigram_chain(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    extra_bigrams = config.extra.get("stopword_bigrams", []) or []
    book_bigrams = {tuple(b) for b in extra_bigrams if len(b) == 2}
    stopword_bigrams = _GENERIC_BIGRAMS | book_bigrams

    findings: list[Finding] = []
    for para in prose.split("\n\n"):
        para = para.strip()
        if not para or len(para) < 100:
            continue
        words = [w.lower() for w in word_tokens(para)]
        threshold = max(3, int(len(words) / 100) + 2)
        bigrams = list(zip(words, words[1:]))
        counts = Counter(bg for bg in bigrams if bg not in stopword_bigrams)
        for bg, n in counts.items():
            if n >= threshold:
                density = round(100 * n / max(len(words), 1), 1)
                findings.append(
                    Finding(
                        type="bigram_chain_loop",
                        confidence=0.75,
                        rule_id="literary_device:bigram_chain.density_above_threshold",
                        extra={
                            "bigram": " ".join(bg),
                            "count": n,
                            "paragraph_word_count": len(words),
                            "density_per_100": density,
                            "threshold_used": threshold,
                            "paragraph_excerpt": para[:140] + ("..." if len(para) > 140 else ""),
                        },
                    )
                )
    return findings
