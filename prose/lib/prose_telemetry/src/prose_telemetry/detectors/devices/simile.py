"""Simile detector — explicit comparison ("like" / "as").

The literary-devices catalog (C15): "Same as metaphor but signals the
comparison openly. Useful when the comparison would otherwise read as
a literal claim."

Detection: surface patterns `like a/an/the <noun>` and `as <adj> as a/an`.
These have high recall but moderate precision; quality classification
(is it a *good* simile?) requires semantic understanding and is
deferred to the LLM tier. This detector flags candidates for review.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_SIMILE_RE = re.compile(
    r"(?:"
    # like a/an/the <word>(s)
    r"\blike\s+(?:a|an|the)\s+[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2}|"
    # as <adj> as a/an
    r"\bas\s+[a-z][\w-]*\s+as\s+(?:a|an|the)\s+[a-z][\w-]*|"
    # as if it were / as though
    r"\bas\s+(?:if|though)\s+[a-z]"
    r")",
    re.IGNORECASE,
)


@register(
    name="simile",
    tier="stdlib",
    family="literary_device",
    description=(
        "Explicit comparison via 'like a/an' or 'as <adj> as' "
        "(catalog C15). Surface-pattern detector; quality "
        "classification deferred to LLM tier."
    ),
    metadata={"catalog_id": "C15"},
)
def detect_simile(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for m in _SIMILE_RE.finditer(prose):
        findings.append(
            Finding(
                type="simile",
                confidence=0.65,
                rule_id="device:simile",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "literary_device",
                    "catalog_id": "C15",
                },
            )
        )
    return findings
