"""Hypophora detector — author asks and immediately answers their own
question.

The literary-devices catalog (D24): "Makes the reader's likely
question explicit, then answers it before the reader can object.
Useful at section breaks." Detection: a sentence ending in `?`
followed within the same paragraph by a non-dialogue declarative
sentence (the answer).

Hypophora is the complement of erotema (catalog D25) — the same
syntactic shape (question in narration) but distinguished by what
follows. The two detectors are deliberately mutually exclusive: a
question that is answered is hypophora; a question that is not is
erotema.
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
    name="hypophora",
    tier="stdlib",
    family="literary_device",
    description=(
        "Author asks and answers their own question (catalog D24). "
        "Question in narration followed by a declarative answer "
        "sentence in the same paragraph."
    ),
    metadata={"catalog_id": "D24"},
)
def detect_hypophora(
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
            if i + 1 >= len(sentences):
                continue
            next_sentence, next_start, next_end = sentences[i + 1]
            if is_dialogue_sentence(next_sentence):
                continue
            if not next_sentence.endswith((".", "!")):
                continue
            # Question + immediate non-dialogue declarative answer.
            abs_start = para_start + start
            abs_end = para_start + next_end
            findings.append(
                Finding(
                    type="hypophora",
                    confidence=0.8,
                    rule_id="device:hypophora",
                    span=(abs_start, abs_end),
                    text=prose[abs_start:abs_end],
                    extra={
                        "family": "literary_device",
                        "catalog_id": "D24",
                        "question": sentence,
                        "answer": next_sentence,
                    },
                )
            )
    return findings
