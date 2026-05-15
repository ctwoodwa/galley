"""Modal verb density — would / could / should / might frequency."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_MODALS = re.compile(
    r"\b(would|could|should|might|may|must|shall|ought|will|won't|"
    r"wouldn't|couldn't|shouldn't|mightn't|mustn't|shan't)\b",
    re.IGNORECASE,
)


@register(
    name="modal_verb",
    tier="stdlib",
    family="literary_device",
    description="Modal verbs (would / could / should / might / …).",
)
def detect_modal_density(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _MODALS.finditer(prose):
        findings.append(
            Finding(
                type="modal_verb",
                confidence=1.0,
                rule_id="literary_device:modal_density.hedging_marker",
                span=(m.start(), m.end()),
                extra={"modal": m.group(1).lower()},
            )
        )
    return findings
