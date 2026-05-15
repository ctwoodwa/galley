"""Infinitive phrase density — 'to <verb>' density (skipping prepositional 'to')."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_INFINITIVE_RE = re.compile(r"\bto\s+([a-z]{2,})\b", re.IGNORECASE)
_PREP_OBJECTS = {"the", "him", "her", "them", "us", "me", "you", "it"}


@register(
    name="infinitive_phrase",
    tier="stdlib",
    family="literary_device",
    description="to-infinitive phrases (excluding prepositional 'to').",
)
def detect_infinitives(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _INFINITIVE_RE.finditer(prose):
        verb = m.group(1).lower()
        if verb in _PREP_OBJECTS:
            continue
        findings.append(
            Finding(
                type="infinitive_phrase",
                confidence=0.7,
                rule_id="literary_device:infinitive_phrase.to_verb_pattern",
                span=(m.start(), m.end()),
                extra={"verb": verb},
            )
        )
    return findings
