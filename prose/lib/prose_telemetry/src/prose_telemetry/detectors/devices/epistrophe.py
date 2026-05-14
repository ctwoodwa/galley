"""Epistrophe detector — repetition at the end of successive clauses.

The literary-devices catalog (A2): "Plants the same closing weight
three times. Where anaphora *opens* with rhythm, epistrophe *lands*
with it." Detection mirrors anaphora's: find runs of N+ consecutive
sentences whose last 2 words match.

Three is the threshold from the catalog ("two links reads as
accidental; aim for three or four for deliberate structure"). Density
escalation is handled by the verdict layer, not here.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    last_n_words,
    split_sentences_with_spans,
)


_DEFAULT_MIN_RUN_LENGTH = 3
_DEFAULT_TAIL_WORDS = 2


@register(
    name="epistrophe",
    tier="stdlib",
    family="literary_device",
    description=(
        "Repetition at the end of successive clauses; 3+ consecutive "
        "sentences ending with the same last N words (default N=2)."
    ),
    metadata={
        "min_run_length_default": _DEFAULT_MIN_RUN_LENGTH,
        "tail_words_default": _DEFAULT_TAIL_WORDS,
        "catalog_id": "A2",
    },
)
def detect_epistrophe(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_run = int(config.extra.get("min_run_length", _DEFAULT_MIN_RUN_LENGTH))
    tail_n = int(config.extra.get("tail_words", _DEFAULT_TAIL_WORDS))
    sentences = split_sentences_with_spans(prose)
    if len(sentences) < min_run:
        return []

    findings: list[Finding] = []
    current_tail: tuple[str, ...] | None = None
    run: list[tuple[str, int, int]] = []

    def flush():
        nonlocal current_tail, run
        if len(run) >= min_run and current_tail:
            findings.append(
                Finding(
                    type="epistrophe",
                    confidence=0.85,
                    rule_id="device:epistrophe",
                    span=(run[0][1], run[-1][2]),
                    text=prose[run[0][1] : run[-1][2]],
                    extra={
                        "family": "literary_device",
                        "catalog_id": "A2",
                        "tail": " ".join(current_tail),
                        "run_length": len(run),
                        "sentences": [s for s, _, _ in run],
                    },
                )
            )
        current_tail = None
        run = []

    for sent in sentences:
        text = sent[0]
        tail = last_n_words(text, tail_n)
        if not tail:
            flush()
            continue
        if current_tail is None:
            current_tail = tail
            run = [sent]
        elif tail == current_tail:
            run.append(sent)
        else:
            flush()
            current_tail = tail
            run = [sent]
    flush()
    return findings
