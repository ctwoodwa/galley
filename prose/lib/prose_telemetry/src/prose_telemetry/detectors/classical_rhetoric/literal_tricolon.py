"""Literal tricolon — "X, Y, and/or Z" serial-comma pattern.

Migrated from `prose_telemetry_handcount.py`. Matches the classic
three-item list at the regex level: two comma-separated phrases of
3–40 characters, followed by `and` or `or`, followed by a third
phrase. Confidence 0.75 — surface-level pattern, not semantic.

No configurable thresholds.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_TRICOLON_RE = re.compile(
    r"(\b\w[\w' -]{2,40}),\s+(\b\w[\w' -]{2,40}),\s+(?:and|or)\s+(\b\w[\w' -]{2,40})"
)


@register(
    name="literal_tricolon",
    tier="stdlib",
    family="literary_device",
    description="'X, Y, and/or Z' three-item serial-comma pattern.",
)
def detect_literal_tricolon(
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
        m = _TRICOLON_RE.search(s)
        if m:
            findings.append(
                Finding(
                    type="literal_tricolon",
                    confidence=0.75,
                    rule_id="literary_device:literal_tricolon.serial_comma_pattern",
                    extra={
                        "items": [m.group(1).strip(), m.group(2).strip(), m.group(3).strip()],
                        "text": m.group(0),
                    },
                )
            )
    return findings
