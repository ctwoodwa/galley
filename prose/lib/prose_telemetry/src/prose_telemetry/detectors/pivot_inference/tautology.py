"""Tautological self-equation — 'the X was the X' and variants."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_TAUT_RE = re.compile(
    r"\bthe\s+(\w+)\s+(?:was|is|were|are|had been|has been)\s+the\s+\1\b",
    re.IGNORECASE,
)


@register(
    name="tautological_self_equation",
    tier="stdlib",
    family="literary_device",
    description="'the X was the X' and grammatical variants.",
)
def detect_tautology(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _TAUT_RE.finditer(prose):
        findings.append(
            Finding(
                type="tautological_self_equation",
                confidence=1.0,
                rule_id="literary_device:tautological_self_equation.regex",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={"head": m.group(1).lower()},
            )
        )
    return findings
