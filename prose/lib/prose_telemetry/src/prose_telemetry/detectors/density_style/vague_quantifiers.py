"""Vague quantifiers — weakening intensifiers + hedge adverbs."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_VAGUE_QUANTIFIERS = re.compile(
    r"\b(very|really|quite|rather|somewhat|fairly|pretty|just|"
    r"almost|nearly|basically|essentially|literally|actually|"
    r"definitely|certainly|probably|perhaps|maybe)\b",
    re.IGNORECASE,
)


@register(
    name="vague_quantifier",
    tier="stdlib",
    family="literary_device",
    description="Weakening intensifiers / hedge adverbs.",
)
def detect_vague_quantifiers(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _VAGUE_QUANTIFIERS.finditer(prose):
        findings.append(
            Finding(
                type="vague_quantifier",
                confidence=0.85,
                rule_id="literary_device:vague_quantifier.weakening_intensifier",
                span=(m.start(), m.end()),
                extra={"word": m.group(1).lower()},
            )
        )
    return findings
