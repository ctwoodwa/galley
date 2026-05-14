"""-ing tail-phrase detector (anti-AI tell #3).

A `-ing` participle clause tacked onto the end of a sentence to add
the appearance of consequence or insight without specifying any.
Lexical markers from the anti-ai-tells skill: highlighting, underscoring,
emphasizing, ensuring, reflecting, symbolizing, contributing to,
fostering, cultivating, encompassing, showcasing, leveraging.

Detection: a sentence's last clause (after a comma) opens with one of
the marker verbs in `-ing` form. Excludes the same forms when they
appear at sentence-internal positions in a different syntactic role
(e.g., subject of a "highlighting that ..." clause).
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    split_sentences_with_spans,
)


_TAIL_MARKERS = (
    "highlighting",
    "underscoring",
    "emphasizing",
    "ensuring",
    "reflecting",
    "symbolizing",
    "contributing to",
    "fostering",
    "cultivating",
    "encompassing",
    "showcasing",
    "leveraging",
    "underlining",
    "illustrating",
)


_TAIL_RE = re.compile(
    r",\s*(" + "|".join(re.escape(m) for m in _TAIL_MARKERS) + r")\b",
    re.IGNORECASE,
)


@register(
    name="ing_tail_phrases",
    tier="structural",
    family="anti_ai",
    description=(
        "Superficial -ing participial clause tacked onto a sentence "
        "tail (anti-AI #3). Pattern: ', <marker_verb>+ing ...' at the "
        "end of a sentence."
    ),
    metadata={"anti_ai_id": "#3"},
)
def detect_ing_tail_phrases(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for sentence, start, end in split_sentences_with_spans(prose):
        for m in _TAIL_RE.finditer(sentence):
            # The `, <marker_word>` shape is the tell — the marker words
            # are specific enough (highlighting, underscoring, ensuring,
            # …) that any post-comma occurrence is suspicious. Position
            # gating in earlier drafts excluded too many real cases
            # (markers right at the 1/3 mark in moderate-length
            # sentences); the marker list itself does the filtering.
            findings.append(
                Finding(
                    type="ing_tail_phrase",
                    confidence=0.8,
                    rule_id="structural:ing_tail_phrase",
                    span=(start + m.start(), end),
                    text=sentence[m.start() :],
                    extra={
                        "family": "anti_ai",
                        "anti_ai_id": "#3",
                        "marker": m.group(1).lower(),
                    },
                )
            )
    return findings
