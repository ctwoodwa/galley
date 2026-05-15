"""Isocolon — consecutive sentences with strongly parallel POS sequences.

Registry wrapper around `spacy_detectors.detect_isocolon`. Requires a
parsed spaCy `Doc` on the `doc` kwarg; without one, returns no
findings (silent — the dispatch logs a skip).

Configurable thresholds via `DetectorConfig.extra`:
  - `min_run` (int, default 2) — minimum number of consecutive parallel
    pairs to count as an isocolon run.
  - `min_pos_overlap` (float, default 0.8) — fraction of POS tags that
    must match for two sentences to be considered parallel.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.spacy_detectors import detect_isocolon as _impl


@register(
    name="isocolon",
    tier="spacy",
    family="literary_device",
    description="Consecutive sentences with strongly parallel POS sequences.",
    metadata={"requires": "spacy_doc"},
)
def detect_isocolon(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or doc is None:
        return []
    min_run = int(config.extra.get("min_run", 2))
    min_pos_overlap = float(config.extra.get("min_pos_overlap", 0.8))
    raw = _impl(doc, min_run=min_run, min_pos_overlap=min_pos_overlap)
    return [_to_finding(r) for r in raw]


def _to_finding(r: dict[str, Any]) -> Finding:
    return Finding(
        type=r["type"],
        confidence=r.get("confidence", 0.75),
        rule_id=r["rule_id"],
        extra={k: v for k, v in r.items() if k not in {"type", "confidence", "rule_id"}},
    )
