"""Passive voice — be-verb + past participle heuristic."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_BE_VERBS = "is|was|were|are|been|being|am|be"
_PASSIVE_RE = re.compile(
    r"\b(" + _BE_VERBS + r")\s+"
    r"((?:[a-z]+ly\s+)?(?:[a-z]+ed|known|seen|made|done|been|gone|"
    r"taken|given|written|told|said|broken|frozen|chosen|driven|"
    r"thrown|found|held|kept|left|paid|set|cut|hit|put|shut|spread|"
    r"shown))\b",
    re.IGNORECASE,
)
_PASSIVE_FALSE_POSITIVES = {
    "is fine", "was fine", "is right", "was right", "is wrong",
    "was wrong", "is open", "was open", "is closed", "was closed",
}


@register(
    name="passive_voice",
    tier="stdlib",
    family="literary_device",
    description="be-verb + past participle as passive heuristic.",
)
def detect_passive_voice(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _PASSIVE_RE.finditer(prose):
        snippet = m.group(0).lower()
        if any(fp in snippet for fp in _PASSIVE_FALSE_POSITIVES):
            continue
        findings.append(
            Finding(
                type="passive_voice",
                confidence=0.55,
                rule_id="literary_device:passive_voice.be_plus_past_participle",
                span=(m.start(), m.end()),
                text=m.group(0),
            )
        )
    return findings
