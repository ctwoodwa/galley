"""Paragraph-opener repeat — same word opening 3+ paragraphs."""

from __future__ import annotations

from collections import Counter
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import is_dialogue, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_FUNCTION_OPENERS = {"the", "a", "an", "this", "that", "it", "he", "she", "they"}


@register(
    name="paragraph_opener_repeat",
    tier="stdlib",
    family="literary_device",
    description="Words opening N+ paragraphs in the chapter.",
)
def detect_paragraph_opener_repeats(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_repeats = int(config.extra.get("min_repeats", 3))

    paras = [p.strip() for p in prose.split("\n\n") if p.strip()]
    openers: list[str] = []
    for p in paras:
        if is_dialogue(p):
            continue
        ws = word_tokens(p)
        if ws:
            openers.append(ws[0].lower())

    findings: list[Finding] = []
    counts = Counter(openers)
    for word, n in counts.items():
        if n >= min_repeats and word not in _FUNCTION_OPENERS:
            findings.append(
                Finding(
                    type="paragraph_opener_repeat",
                    confidence=0.85,
                    rule_id="literary_device:paragraph_opener.repeat_above_threshold",
                    extra={
                        "word": word,
                        "count": n,
                        "total_paragraphs": len(openers),
                    },
                )
            )
    return findings
