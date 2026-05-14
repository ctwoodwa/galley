"""Erotema detector — rhetorical question in narration.

The literary-devices catalog (D25): "The question carries the
assertion. *'Who would design it this way?'* — the reader supplies
*no one*." Distinguished from hypophora (where the author answers
their own question — see hypophora.py) by the *absence* of an answer
sentence after the question.

Detection: a sentence ending in `?` that is (1) not dialogue (no quote
markers) and (2) not followed by a non-dialogue declarative sentence
within the same paragraph (which would make it hypophora). The
paragraph boundary is treated as terminating the lookahead.

This detector is intentionally precision-favoring — it skips
questions inside dialogue and any question paired with an immediate
declarative answer.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    is_dialogue_sentence,
    split_sentences_with_spans,
)


@register(
    name="erotema",
    tier="stdlib",
    family="literary_device",
    description=(
        "Rhetorical question in narration (catalog D25). Question "
        "sentence in non-dialogue context with no following answer "
        "sentence."
    ),
    metadata={"catalog_id": "D25"},
)
def detect_erotema(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    paragraphs = [p for p in prose.split("\n\n") if p.strip()]
    findings: list[Finding] = []
    offset = 0
    for para in paragraphs:
        para_start = prose.find(para, offset)
        offset = para_start + len(para)
        sentences = split_sentences_with_spans(para)
        for i, (sentence, start, end) in enumerate(sentences):
            if not sentence.endswith("?"):
                continue
            if is_dialogue_sentence(sentence):
                continue
            # Look at the next sentence (if any) — if it's declarative
            # and non-dialogue, this is hypophora, not erotema.
            if i + 1 < len(sentences):
                next_sent = sentences[i + 1][0]
                if not is_dialogue_sentence(next_sent) and next_sent.endswith(
                    (".", "!")
                ):
                    # Author answered their own question — that's
                    # hypophora's territory, not erotema.
                    continue
            abs_start = para_start + start
            abs_end = para_start + end
            findings.append(
                Finding(
                    type="erotema",
                    confidence=0.8,
                    rule_id="device:erotema",
                    span=(abs_start, abs_end),
                    text=sentence,
                    extra={
                        "family": "literary_device",
                        "catalog_id": "D25",
                    },
                )
            )
    return findings
