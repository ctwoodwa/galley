"""Distributed chiasmus — ABBA lemma reversal across a windowed range.

Registry wrapper around `spacy_detectors.detect_distributed_chiasmus`.
Requires a parsed spaCy `Doc` on the `doc` kwarg.

Configurable threshold:
  - `window` (int, default 30) — max token distance to look ahead for
    the reversed pair before giving up.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.spacy_detectors import (
    detect_distributed_chiasmus as _impl,
)


@register(
    name="distributed_chiasmus",
    tier="spacy",
    family="literary_device",
    description="ABBA lemma reversal across a windowed token range.",
    metadata={"requires": "spacy_doc"},
)
def detect_distributed_chiasmus(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or doc is None:
        return []
    window = int(config.extra.get("window", 30))
    raw = _impl(doc, window=window)
    return [
        Finding(
            type=r["type"],
            confidence=r.get("confidence", 0.7),
            rule_id=r["rule_id"],
            extra={k: v for k, v in r.items() if k not in {"type", "confidence", "rule_id"}},
        )
        for r in raw
    ]
