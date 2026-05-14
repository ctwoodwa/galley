"""Assonance detector — vowel-phoneme repetition within a sentence.

Texture-level effect. The literary-devices catalog notes assonance is
almost always a revision-pass artifact, not a deliberate drafting tool.
For this reason the detector is informational only — it reports the
DOMINANT vowel phoneme per sentence and any sentences where one vowel
phoneme accounts for ≥ 50% of the vowel phonemes present (a strong
assonance signal).

Confidence is intentionally low (0.55) so the verdict layer treats this
as informational rather than warning-worthy.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.sonics.phonemes import (
    is_stopword,
    tokenize,
    vowel_phonemes,
)


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])")
_DEFAULT_MIN_DOMINANCE = 0.5  # ≥ 50% of vowels share one phoneme
_DEFAULT_MIN_VOWEL_COUNT = 6  # need enough vowel phonemes to be meaningful


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
    name="assonance",
    tier="stdlib",
    family="sonics",
    description=(
        "Sentence-level vowel-phoneme dominance — flags sentences where "
        "one vowel sound accounts for ≥ 50% of vowel phonemes (CMU dict). "
        "Informational only; assonance is usually a revision artifact."
    ),
    metadata={
        "min_dominance_default": _DEFAULT_MIN_DOMINANCE,
        "min_vowel_count_default": _DEFAULT_MIN_VOWEL_COUNT,
    },
)
def detect_assonance(
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
    min_vowel_count = int(
        config.extra.get("min_vowel_count", _DEFAULT_MIN_VOWEL_COUNT)
    )

    findings: list[Finding] = []
    for sentence, start, end in _split_sentences_with_spans(prose):
        vowel_counter: Counter[str] = Counter()
        for word, _, _ in tokenize(sentence):
            if is_stopword(word):
                continue
            vowel_counter.update(vowel_phonemes(word))
        total = sum(vowel_counter.values())
        if total < min_vowel_count:
            continue
        top_phoneme, top_n = vowel_counter.most_common(1)[0]
        dominance = top_n / total
        if dominance >= min_dominance:
            findings.append(
                Finding(
                    type="assonance",
                    confidence=0.55,
                    rule_id="sonics:assonance",
                    span=(start, end),
                    text=sentence,
                    extra={
                        "family": "sonics",
                        "dominant_vowel": top_phoneme,
                        "dominance": round(dominance, 3),
                        "vowel_count": total,
                        "distribution": dict(vowel_counter),
                    },
                )
            )
    return findings
