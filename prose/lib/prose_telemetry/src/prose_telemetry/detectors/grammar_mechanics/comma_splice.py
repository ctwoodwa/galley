"""Comma splice — pronoun+verb after comma without conjunction."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_COMMA_SPLICE_RE = re.compile(
    r"[a-z],\s+(I|he|she|it|they|we|you)\s+(was|were|is|are|"
    r"had|have|did|do|went|came|said|knew|told|saw|felt|made|took|gave|got)\b",
)
_COORDINATORS = (" and ", " but ", " or ", " yet ", " for ", " so ")


@register(
    name="comma_splice",
    tier="stdlib",
    family="literary_device",
    description="Pronoun+verb after comma without coordinating conjunction.",
)
def detect_comma_splices(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _COMMA_SPLICE_RE.finditer(prose):
        # Skip when a coordinator is in the preceding context — compound
        # predicate, not splice.
        context_start = max(0, m.start() - 50)
        context = prose[context_start:m.start() + 10].lower()
        if any(c in context for c in _COORDINATORS):
            continue
        findings.append(
            Finding(
                type="comma_splice",
                confidence=0.5,
                rule_id="literary_device:comma_splice.pronoun_after_comma",
                span=(m.start(), m.end()),
                text=m.group(0),
            )
        )
    return findings
