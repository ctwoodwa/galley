"""Nominalization density — nouns derived from verbs (tion/sion/ment/...).

Registry wrapper around `spacy_detectors.detect_nominalizations`.
Requires a parsed spaCy `Doc` on the `doc` kwarg. No configurable
thresholds today — the suffix list is intrinsic to the detector.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.spacy_detectors import detect_nominalizations as _impl


@register(
    name="nominalization",
    tier="spacy",
    family="literary_device",
    description="POS-verified abstract nouns (verb-derived suffixes).",
    metadata={"requires": "spacy_doc"},
)
def detect_nominalization(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or doc is None:
        return []
    raw = _impl(doc)
    return [
        Finding(
            type=r["type"],
            confidence=r.get("confidence", 0.7),
            rule_id=r["rule_id"],
            extra={k: v for k, v in r.items() if k not in {"type", "confidence", "rule_id"}},
        )
        for r in raw
    ]
