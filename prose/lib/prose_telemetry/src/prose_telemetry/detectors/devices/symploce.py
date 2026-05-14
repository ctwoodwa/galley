"""Symploce detector — anaphora + epistrophe combined.

The literary-devices catalog (A3): "Locks the variable middle between
two repeated anchors. Reads as inevitability — the framing is the
same; only the contents change." Detection: 3+ consecutive sentences
sharing both first N words AND last N words.

Symploce is heavier than its components; the catalog recommends "once
per chapter, not once per section." A finding is therefore worth
emitting even at run length 2 in the per-document context, but the
detector keeps the conservative min_run_length=3 default to match the
other rhythm detectors. Tune per book via DetectorConfig.extra.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    first_n_words,
    last_n_words,
    split_sentences_with_spans,
)


_DEFAULT_MIN_RUN_LENGTH = 3
_DEFAULT_HEAD_WORDS = 2
_DEFAULT_TAIL_WORDS = 2


@register(
    name="symploce",
    tier="stdlib",
    family="literary_device",
    description=(
        "Anaphora + epistrophe combined: 3+ consecutive sentences "
        "sharing both first N words and last N words (default N=2 each)."
    ),
    metadata={
        "min_run_length_default": _DEFAULT_MIN_RUN_LENGTH,
        "head_words_default": _DEFAULT_HEAD_WORDS,
        "tail_words_default": _DEFAULT_TAIL_WORDS,
        "catalog_id": "A3",
    },
)
def detect_symploce(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_run = int(config.extra.get("min_run_length", _DEFAULT_MIN_RUN_LENGTH))
    head_n = int(config.extra.get("head_words", _DEFAULT_HEAD_WORDS))
    tail_n = int(config.extra.get("tail_words", _DEFAULT_TAIL_WORDS))
    sentences = split_sentences_with_spans(prose)
    if len(sentences) < min_run:
        return []

    findings: list[Finding] = []
    anchor: tuple[tuple[str, ...], tuple[str, ...]] | None = None
    run: list[tuple[str, int, int]] = []

    def flush():
        nonlocal anchor, run
        if len(run) >= min_run and anchor:
            findings.append(
                Finding(
                    type="symploce",
                    confidence=0.9,
                    rule_id="device:symploce",
                    span=(run[0][1], run[-1][2]),
                    text=prose[run[0][1] : run[-1][2]],
                    extra={
                        "family": "literary_device",
                        "catalog_id": "A3",
                        "head": " ".join(anchor[0]),
                        "tail": " ".join(anchor[1]),
                        "run_length": len(run),
                        "sentences": [s for s, _, _ in run],
                    },
                )
            )
        anchor = None
        run = []

    for sent in sentences:
        text = sent[0]
        head = first_n_words(text, head_n)
        tail = last_n_words(text, tail_n)
        if not head or not tail:
            flush()
            continue
        pair = (head, tail)
        if anchor is None:
            anchor = pair
            run = [sent]
        elif pair == anchor:
            run.append(sent)
        else:
            flush()
            anchor = pair
            run = [sent]
    flush()
    return findings
