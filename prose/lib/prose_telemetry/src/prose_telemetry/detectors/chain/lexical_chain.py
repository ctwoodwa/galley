"""Lexical chain loop — content word repeated past density threshold.

Migrated from `prose_telemetry_handcount.py`. Per-paragraph: counts
lowercase content words (≥5 letters) and flags any that appear with
density exceeding the topic-word baseline.

Threshold: `count >= max(3, paragraph_word_count / 75)` — looser for
longer paragraphs to suppress topic-word false positives (a 500-word
paragraph about coffee will say 'coffee' five times functionally).

Stopword model (see package docstring): `_GENERIC_STOPWORDS` ship as
defaults; book.editorial.yaml's `detectors.lexical_chain_loop.stopwords`
list is merged on top per `DetectorConfig.stopwords`.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


# Generic English stopwords — words that recur as register/glue rather
# than as load-bearing topic words. Anna-specific high-frequency
# register words (consortium, architecture, mission, …) belong in the
# per-book yaml, NOT here.
_GENERIC_STOPWORDS = frozenset({
    "would", "could", "should", "where", "there", "their", "which",
    "about", "after", "again", "those", "these", "while", "until",
    "before", "since", "every", "other", "another", "first", "second",
    "third", "thought", "myself", "herself", "himself", "themselves",
    "yourself", "without", "between", "through", "during", "against",
    "because", "always", "never", "still", "right", "wrong", "going",
    "really", "anything", "something", "nothing", "everything", "anyone",
    "someone", "everyone", "course", "kind", "thing", "things",
})


_WORD_RE = re.compile(r"(?<![A-Za-z])([a-z][a-z]{4,})(?![A-Za-z'])")
_PARA_TOKEN_RE = re.compile(r"\b[A-Za-z][A-Za-z'-]*\b")


@register(
    name="lexical_chain_loop",
    tier="stdlib",
    family="literary_device",
    description="Content word repeated past density threshold in one paragraph.",
)
def detect_lexical_chain(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    stopwords = _GENERIC_STOPWORDS | {w.lower() for w in config.stopwords}

    findings: list[Finding] = []
    for para in prose.split("\n\n"):
        para = para.strip()
        if not para or len(para) < 80:
            continue
        para_word_count = len(_PARA_TOKEN_RE.findall(para))
        threshold = max(3, int(para_word_count / 75) + 1)
        words = _WORD_RE.findall(para)
        counts = Counter(w for w in words if w not in stopwords)
        for word, n in counts.items():
            if n >= threshold:
                density = round(100 * n / max(para_word_count, 1), 1)
                findings.append(
                    Finding(
                        type="lexical_chain_loop",
                        confidence=0.75,
                        rule_id="literary_device:lexical_chain.density_above_threshold",
                        extra={
                            "word": word,
                            "count": n,
                            "paragraph_word_count": para_word_count,
                            "density_per_100": density,
                            "paragraph_excerpt": para[:140] + ("..." if len(para) > 140 else ""),
                        },
                    )
                )
    return findings
