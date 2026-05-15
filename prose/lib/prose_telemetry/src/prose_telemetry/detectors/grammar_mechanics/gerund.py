"""Gerund density — -ing nouns and participles (with exclusions)."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_GERUND_RE = re.compile(r"\b([a-z]{3,}ing)\b", re.IGNORECASE)
_GERUND_EXCLUDE = {
    "during", "morning", "evening", "nothing", "anything", "everything",
    "something", "feeling", "meeting", "writing", "reading",
    "having", "being", "going", "coming", "looking", "thinking",
    "wedding", "ceiling", "ring", "spring", "string", "thing",
    "wing", "king", "bring", "sing",
}


@register(
    name="gerund",
    tier="stdlib",
    family="literary_device",
    description="-ing forms (excluding common non-gerund -ing words).",
)
def detect_gerunds(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _GERUND_RE.finditer(prose):
        word = m.group(1).lower()
        if word in _GERUND_EXCLUDE:
            continue
        if word.endswith("thing"):
            continue
        findings.append(
            Finding(
                type="gerund",
                confidence=0.6,
                rule_id="literary_device:gerund.ing_suffix",
                span=(m.start(), m.end()),
                extra={"word": word},
            )
        )
    return findings
