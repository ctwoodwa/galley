"""Phoneme-level alliteration detector.

Catches runs of N+ consecutive content words sharing the same initial
consonant phoneme. Skips function words (the, a, of, …) so a run isn't
broken by them, but the matching anchor must be a content word.

A run length of 3 is the prose ceiling cited in the literary-devices
catalog; runs of 4+ become chants and are usually unintentional. The
detector's default minimum run length is 3; tunable via
DetectorConfig.extra['min_run_length'].
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.sonics.phonemes import (
    first_initial,
    is_stopword,
    tokenize,
)


_DEFAULT_MIN_RUN_LENGTH = 3


def _walk_alliteration_runs(
    tokens: list[tuple[str, int, int]],
    min_run_length: int,
) -> list[dict[str, Any]]:
    """Walk the token list, emitting runs of content words with shared
    initial consonant. Function words don't break runs (they're skipped),
    but only content-word initials are compared.

    Returns one dict per qualifying run with shape:
      {phoneme, words, start_char, end_char, run_length}
    """
    runs: list[dict[str, Any]] = []
    current_anchor: str | None = None
    current_words: list[tuple[str, int, int]] = []

    def flush():
        nonlocal current_anchor, current_words
        if len(current_words) >= min_run_length and current_anchor:
            runs.append(
                {
                    "phoneme": current_anchor,
                    "words": [w[0] for w in current_words],
                    "start_char": current_words[0][1],
                    "end_char": current_words[-1][2],
                    "run_length": len(current_words),
                }
            )
        current_anchor = None
        current_words = []

    for tok in tokens:
        word, _, _ = tok
        if is_stopword(word):
            # Function words don't break runs but don't extend them.
            continue
        initial = first_initial(word)
        if not initial:
            flush()
            continue
        # Alliteration is consonant-based by tradition. Reject vowel
        # anchors (those are assonance territory).
        if initial[0] in "AEIOU":
            flush()
            continue
        if current_anchor is None:
            current_anchor = initial
            current_words = [tok]
        elif initial == current_anchor:
            current_words.append(tok)
        else:
            flush()
            current_anchor = initial
            current_words = [tok]

    flush()
    return runs


@register(
    name="alliteration",
    tier="stdlib",
    family="sonics",
    description=(
        "Runs of 3+ consecutive content words sharing the same initial "
        "consonant phoneme (CMU dict + orthographic fallback)."
    ),
    metadata={"min_run_length_default": _DEFAULT_MIN_RUN_LENGTH},
)
def detect_alliteration(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_run = int(config.extra.get("min_run_length", _DEFAULT_MIN_RUN_LENGTH))
    tokens = tokenize(prose)
    runs = _walk_alliteration_runs(tokens, min_run_length=min_run)

    findings: list[Finding] = []
    for run in runs:
        findings.append(
            Finding(
                type="alliteration",
                confidence=0.85,
                rule_id="sonics:alliteration",
                span=(run["start_char"], run["end_char"]),
                text=prose[run["start_char"] : run["end_char"]],
                extra={
                    "family": "sonics",
                    "phoneme": run["phoneme"],
                    "words": run["words"],
                    "run_length": run["run_length"],
                },
            )
        )
    return findings
