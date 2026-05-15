"""Nominalization density — nouns derived from verbs (tion/sion/ment/...).

Registry wrapper around `spacy_detectors.detect_nominalizations`.
Requires a parsed spaCy `Doc` on the `doc` kwarg.

Uses a per-lemma soft-cap gradient (the detector ships with sensible
defaults for common abstract nouns). Per-book overrides flow through
two `DetectorConfig.extra` knobs:

  - `soft_caps`: dict[lemma → int] mapping book-specific content
    lemmas to their per-chapter cap. Merged on top of the detector's
    built-in defaults; entries here override defaults for that lemma.
  - `default_cap`: integer cap applied to unmapped lemmas. Default 0
    (every occurrence flags, the safe choice for new vocab).

A lemma's first N occurrences are treated as content vocabulary
(invisible to the detector). Occurrence #(N+1) onward fires as a
finding with `occurrence_index` and `over_cap_by` in the payload.

Legacy `DetectorConfig.stopwords` (list[str]) is still accepted for
backwards compatibility — bare-string entries are treated as
`{lemma: 999}` (effectively unlimited / always content).
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
    soft_caps: dict[str, int] = {}
    # Legacy stopwords list → effectively-unlimited cap (treated as content).
    for word in (config.stopwords or []):
        soft_caps[word.lower()] = 999
    # Per-lemma soft caps from config.extra (book yaml).
    explicit = config.extra.get("soft_caps") or {}
    if isinstance(explicit, dict):
        for k, v in explicit.items():
            soft_caps[str(k).lower()] = int(v)
    default_cap = int(config.extra.get("default_cap", 0))
    raw = _impl(doc, soft_caps=soft_caps or None, default_cap=default_cap)
    return [
        Finding(
            type=r["type"],
            confidence=r.get("confidence", 0.7),
            rule_id=r["rule_id"],
            extra={k: v for k, v in r.items() if k not in {"type", "confidence", "rule_id"}},
        )
        for r in raw
    ]
