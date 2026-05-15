"""Conjunction-start — sentences opening with And / But / So / Or / Yet / Nor."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import is_dialogue, split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_CONJUNCTION_START = re.compile(r"^(And|But|So|Or|Yet|Nor)\b")


@register(
    name="conjunction_start",
    tier="stdlib",
    family="literary_device",
    description="Sentences starting with And/But/So/Or/Yet/Nor.",
)
def detect_conjunction_starts(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for s in split_sentences(prose):
        if is_dialogue(s):
            continue
        m = _CONJUNCTION_START.match(s.strip())
        if m:
            findings.append(
                Finding(
                    type="conjunction_start",
                    confidence=1.0,
                    rule_id="literary_device:conjunction_start.coordinating",
                    extra={
                        "conjunction": m.group(1),
                        "sentence_start": s[:80],
                    },
                )
            )
    return findings
