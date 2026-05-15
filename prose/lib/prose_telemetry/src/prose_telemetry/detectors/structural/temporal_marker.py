"""Temporal markers — narrative-time adverbs (then, now, soon, …)."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_TEMPORAL_MARKERS = re.compile(
    r"\b(then|now|soon|suddenly|eventually|finally|immediately|"
    r"presently|shortly|previously|currently|formerly|"
    r"earlier|later|afterwards|afterward|meanwhile)\b",
    re.IGNORECASE,
)


@register(
    name="temporal_marker",
    tier="stdlib",
    family="literary_device",
    description="Narrative-time adverbs (then/now/soon/suddenly/…).",
)
def detect_temporal_markers(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _TEMPORAL_MARKERS.finditer(prose):
        findings.append(
            Finding(
                type="temporal_marker",
                confidence=0.9,
                rule_id="literary_device:temporal_marker.transition_adverb",
                span=(m.start(), m.end()),
                extra={"marker": m.group(1).lower()},
            )
        )
    return findings
