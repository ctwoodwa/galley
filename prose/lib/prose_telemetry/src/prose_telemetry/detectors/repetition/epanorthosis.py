"""Epanorthosis — '*not X — Y*' self-correction pattern.

Migrated from `prose_telemetry_handcount.py`. Same regex
(`\\bnot\\s+[^,.;:—-]{2,60}\\s+[—–-]\\s+[A-Za-z]`) so counts match the
handcount baseline exactly.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_EPANORTH_RE = re.compile(
    r"\bnot\s+[^,.;:—-]{2,60}\s+[—–-]\s+[A-Za-z]",
    re.IGNORECASE,
)


@register(
    name="epanorthosis",
    tier="stdlib",
    family="literary_device",
    description="'not X — Y' self-correction pattern.",
)
def detect_epanorthosis(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _EPANORTH_RE.finditer(prose):
        findings.append(
            Finding(
                type="epanorthosis",
                confidence=0.7,
                rule_id="literary_device:epanorthosis.not_X_em_Y",
                span=(m.start(), m.end()),
                text=m.group(0),
            )
        )
    return findings
