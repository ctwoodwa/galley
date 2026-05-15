"""Paragraph-length anomaly — over-4x or under-0.2x chapter mean."""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


@register(
    name="paragraph_length_anomaly",
    tier="stdlib",
    family="literary_device",
    description="Paragraphs whose word count diverges from chapter mean.",
)
def detect_paragraph_length_anomaly(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    paras = [p.strip() for p in prose.split("\n\n") if p.strip() and len(p.strip()) > 30]
    if len(paras) < 5:
        return findings
    lengths = [len(word_tokens(p)) for p in paras]
    mean_len = sum(lengths) / len(lengths)
    for p, n in zip(paras, lengths):
        if n > 4 * mean_len:
            findings.append(
                Finding(
                    type="paragraph_length_anomaly",
                    confidence=0.6,
                    rule_id="literary_device:paragraph_length.over_4x_mean",
                    extra={
                        "kind": "oversized",
                        "word_count": n,
                        "chapter_mean": round(mean_len, 1),
                        "ratio": round(n / mean_len, 1),
                        "paragraph_excerpt": p[:120] + ("..." if len(p) > 120 else ""),
                    },
                )
            )
        elif n < 0.2 * mean_len and n >= 5:
            findings.append(
                Finding(
                    type="paragraph_length_anomaly",
                    confidence=0.4,
                    rule_id="literary_device:paragraph_length.under_0.2x_mean",
                    extra={
                        "kind": "undersized",
                        "word_count": n,
                        "chapter_mean": round(mean_len, 1),
                        "ratio": round(n / mean_len, 2),
                        "paragraph_excerpt": p,
                    },
                )
            )
    return findings
