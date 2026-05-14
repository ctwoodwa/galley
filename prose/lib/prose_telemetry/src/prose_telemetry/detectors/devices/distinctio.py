"""Distinctio detector — explicit definition before argument.

The literary-devices catalog (E30): "Names the senses of a term so
the argument that follows cannot be deflected by ambiguity." Useful
for words like *sovereignty*, *local-first*, *durability* that carry
vendor-shaped baggage.

Detection: phrases that explicitly introduce a definition. High-
precision pattern set drawn from the catalog's worked example.

Triggers:
  By 'X' we mean ...   /   By "X" we mean ...
  By X we mean ...     (unquoted noun-phrase case; lower confidence)
  What I mean by 'X'   /   What we mean by 'X'
  When I say 'X' I mean ...
  This is what 'X' means: ...
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_DISTINCTIO_RE = re.compile(
    r"(?:"
    # By "X" we mean / By 'X' we mean
    r"\bby\s+['\"“‘][^'\"”’]{1,40}['\"”’]\s+(?:we|i)\s+mean\b|"
    # What I/we mean by "X"
    r"\bwhat\s+(?:we|i)\s+mean\s+by\s+['\"“‘][^'\"”’]{1,40}['\"”’]|"
    # When I/we say "X" ...
    r"\bwhen\s+(?:we|i)\s+say\s+['\"“‘][^'\"”’]{1,40}['\"”’]|"
    # This is what 'X' means:
    r"\bthis\s+is\s+what\s+['\"“‘][^'\"”’]{1,40}['\"”’]\s+means\b|"
    # By X we mean (unquoted; lower-confidence but still useful)
    r"\bby\s+[A-Z][a-z-]+(?:\s+[A-Z][a-z-]+){0,3}\s+(?:we|i)\s+mean\b"
    r")",
    re.IGNORECASE,
)


@register(
    name="distinctio",
    tier="stdlib",
    family="literary_device",
    description=(
        "Explicit definition before argument (catalog E30). High-"
        "precision phrases that introduce a term's meaning."
    ),
    metadata={"catalog_id": "E30"},
)
def detect_distinctio(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for m in _DISTINCTIO_RE.finditer(prose):
        findings.append(
            Finding(
                type="distinctio",
                confidence=0.9,
                rule_id="device:distinctio",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "literary_device",
                    "catalog_id": "E30",
                },
            )
        )
    return findings
