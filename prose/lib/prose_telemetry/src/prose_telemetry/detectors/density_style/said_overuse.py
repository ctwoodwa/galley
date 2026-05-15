"""Dialogue-attribution overuse — he/she/I/they/we said overuse."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_SAID_TAGS = re.compile(
    r"\b(he|she|I|they|we)\s+(said|replied|asked|answered|told|added|stated|"
    r"declared|whispered|murmured|continued|repeated)\b",
    re.IGNORECASE,
)


@register(
    name="said_tag",
    tier="stdlib",
    family="literary_device",
    description="Dialogue attribution tags (he said / she replied / …).",
)
def detect_said_overuse(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _SAID_TAGS.finditer(prose):
        findings.append(
            Finding(
                type="said_tag",
                confidence=1.0,
                rule_id="literary_device:said_tag.attribution_verb",
                span=(m.start(), m.end()),
                text=m.group(0).lower(),
                extra={"verb": m.group(2).lower()},
            )
        )
    return findings
