"""Parenthetical density — per-paragraph em-dash + paren appositions."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_EM_DASH_RE = re.compile(r"\s—\s")


@register(
    name="parenthetical_density",
    tier="stdlib",
    family="literary_device",
    description="Em-dash + paren appositions per sentence in a paragraph.",
)
def detect_parenthetical_density(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for para in prose.split("\n\n"):
        para = para.strip()
        if not para or len(para) < 100:
            continue
        em_dashes = len(_EM_DASH_RE.findall(para))
        parens = para.count("(")
        appositions = em_dashes // 2 + parens
        sents = split_sentences(para)
        if not sents:
            continue
        ratio = appositions / len(sents)
        if ratio > 0.5 and appositions >= 3:
            findings.append(
                Finding(
                    type="parenthetical_density",
                    confidence=0.6,
                    rule_id="literary_device:parenthetical_density.appositions_per_sentence",
                    extra={
                        "em_dashes": em_dashes,
                        "parens": parens,
                        "appositions_estimate": appositions,
                        "sentence_count": len(sents),
                        "ratio": round(ratio, 2),
                        "paragraph_excerpt": para[:140] + ("..." if len(para) > 140 else ""),
                    },
                )
            )
    return findings
