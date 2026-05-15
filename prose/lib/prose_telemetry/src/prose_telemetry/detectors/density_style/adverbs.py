"""-ly adverb density. Excludes common non-adverbial -ly words."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_ADVERB_LY = re.compile(r"\b[a-z]{4,}ly\b", re.IGNORECASE)
_ADVERB_EXCLUDE = {
    "only", "early", "really", "family", "ugly", "lovely", "lonely",
    "deadly", "daily", "yearly", "weekly", "kindly", "friendly",
    "lively", "monthly", "homely", "july",
}


@register(
    name="adverb_ly",
    tier="stdlib",
    family="literary_device",
    description="-ly adverbs (excluding common non-adverbial words).",
)
def detect_adverbs(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _ADVERB_LY.finditer(prose):
        word = m.group(0).lower()
        if word in _ADVERB_EXCLUDE:
            continue
        findings.append(
            Finding(
                type="adverb_ly",
                confidence=0.85,
                rule_id="literary_device:adverb.ly_suffix",
                span=(m.start(), m.end()),
                extra={"word": word},
            )
        )
    return findings
