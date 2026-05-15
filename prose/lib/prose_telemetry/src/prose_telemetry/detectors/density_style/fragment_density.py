"""Fragment density — consecutive runs of ≤4-word sentences.

Configurable:
  - `min_chain` (int, default 3) — minimum consecutive short sentences
    to flag a fragment cascade.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


@register(
    name="fragment_density",
    tier="stdlib",
    family="literary_device",
    description="Consecutive runs of ≤4-word sentences (fragment cascade).",
)
def detect_fragment_density(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_chain = int(config.extra.get("min_chain", 3))

    sents = split_sentences(prose)
    findings: list[Finding] = []
    i = 0
    while i < len(sents):
        run = 0
        while i + run < len(sents) and len(word_tokens(sents[i + run])) <= 4:
            run += 1
        if run >= min_chain:
            findings.append(
                Finding(
                    type="fragment_density",
                    confidence=0.7,
                    rule_id="literary_device:fragment_density.consecutive_short_sentences",
                    extra={
                        "run_length": run,
                        "sentences": sents[i:i + run],
                    },
                )
            )
            i += run
        else:
            i += 1
    return findings
