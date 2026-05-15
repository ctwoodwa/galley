"""Double negative — proximity-matched not/never patterns."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_DOUBLE_NEG_RE = re.compile(
    r"\b(?:not|n't)\b[^.!?]{1,40}\b(?:no|none|nothing|never|nobody|nowhere|neither)\b",
    re.IGNORECASE,
)


@register(
    name="double_negative",
    tier="stdlib",
    family="literary_device",
    description="Double-negative patterns within close range.",
)
def detect_double_negatives(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _DOUBLE_NEG_RE.finditer(prose):
        findings.append(
            Finding(
                type="double_negative",
                confidence=0.7,
                rule_id="literary_device:double_negative.proximity_match",
                span=(m.start(), m.end()),
                text=m.group(0)[:80],
            )
        )
    return findings
