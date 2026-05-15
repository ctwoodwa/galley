"""Antithesis — single-sentence opposing-clause structures.

Registry wrapper around `spacy_detectors.detect_antithesis`. Detects
sentences joined by but / yet / however / though / although / whereas
where each clause has substantive content.

Configurable threshold:
  - `min_side_tokens` (int, default 4) — minimum content-token count
    each side of the conjunction must carry to count as antithesis.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.spacy_detectors import detect_antithesis as _impl


@register(
    name="antithesis_within_sentence",
    tier="spacy",
    family="literary_device",
    description="Within-sentence opposing clauses joined by but/yet/though/etc.",
    metadata={"requires": "spacy_doc"},
)
def detect_antithesis_within_sentence(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or doc is None:
        return []
    min_side = int(config.extra.get("min_side_tokens", 4))
    raw = _impl(doc, min_side_tokens=min_side)
    return [
        Finding(
            type=r["type"],
            confidence=r.get("confidence", 0.55),
            rule_id=r["rule_id"],
            extra={k: v for k, v in r.items() if k not in {"type", "confidence", "rule_id"}},
        )
        for r in raw
    ]
