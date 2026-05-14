"""Consonance detector — consonant-phoneme repetition within a sentence.

Mirror of `assonance.py` but counting consonant phonemes anywhere in
each word (not just the initial — that's `alliteration`'s job). Like
assonance, this is a texture-level effect that's usually a revision
artifact; the detector is informational only.

Skips very short words (< 3 characters) since they contribute few
consonant phonemes and noise the dominance ratio.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.sonics.phonemes import (
    consonant_phonemes,
    is_stopword,
    tokenize,
)


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])")
_DEFAULT_MIN_DOMINANCE = 0.4
_DEFAULT_MIN_CONSONANT_COUNT = 10


def _split_sentences_with_spans(prose: str) -> list[tuple[str, int, int]]:
    out: list[tuple[str, int, int]] = []
    pos = 0
    for match in _SENTENCE_END.finditer(prose):
        end = match.start()
        sentence = prose[pos:end].strip()
        if sentence:
            offset = prose.find(sentence, pos)
            out.append((sentence, offset, offset + len(sentence)))
        pos = match.end()
    if pos < len(prose):
        sentence = prose[pos:].strip()
        if sentence:
            offset = prose.find(sentence, pos)
            out.append((sentence, offset, offset + len(sentence)))
    return out


@register(
    name="consonance",
    tier="stdlib",
    family="sonics",
    description=(
        "Sentence-level consonant-phoneme dominance — flags sentences "
        "where one consonant sound accounts for ≥ 40% of consonant "
        "phonemes (CMU dict). Informational only."
    ),
    metadata={
        "min_dominance_default": _DEFAULT_MIN_DOMINANCE,
        "min_consonant_count_default": _DEFAULT_MIN_CONSONANT_COUNT,
    },
)
def detect_consonance(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_dominance = float(
        config.extra.get("min_dominance", _DEFAULT_MIN_DOMINANCE)
    )
    min_count = int(
        config.extra.get("min_consonant_count", _DEFAULT_MIN_CONSONANT_COUNT)
    )

    findings: list[Finding] = []
    for sentence, start, end in _split_sentences_with_spans(prose):
        counter: Counter[str] = Counter()
        for word, _, _ in tokenize(sentence):
            if is_stopword(word) or len(word) < 3:
                continue
            counter.update(consonant_phonemes(word))
        total = sum(counter.values())
        if total < min_count:
            continue
        top_phoneme, top_n = counter.most_common(1)[0]
        dominance = top_n / total
        if dominance >= min_dominance:
            findings.append(
                Finding(
                    type="consonance",
                    confidence=0.55,
                    rule_id="sonics:consonance",
                    span=(start, end),
                    text=sentence,
                    extra={
                        "family": "sonics",
                        "dominant_consonant": top_phoneme,
                        "dominance": round(dominance, 3),
                        "consonant_count": total,
                        "distribution": dict(counter),
                    },
                )
            )
    return findings
