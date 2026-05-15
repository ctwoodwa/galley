"""Anaphora — consecutive sentences sharing their first N words.

Migrated from `the-inverted-stack/build/prose_telemetry_handcount.py`
(Phase 8 batch 1). Same algorithm; sentence-splitter + tokenizer
mirrored in `_common/text` so counts match the handcount baseline
exactly.

Configurable thresholds via `DetectorConfig.extra`:
  - `n_prefix` (int, default 2) — length of the shared opening to test.
  - `min_run` (int, default 3) — minimum number of consecutive sentences
    sharing the prefix to count as anaphora.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


@register(
    name="anaphora",
    tier="stdlib",
    family="literary_device",
    description="N+ consecutive sentences sharing the first n_prefix words.",
)
def detect_anaphora(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    n_prefix = int(config.extra.get("n_prefix", 2))
    min_run = int(config.extra.get("min_run", 3))

    sents = split_sentences(prose)
    if not sents:
        return []

    def _prefix(s: str) -> str | None:
        toks = word_tokens(s)[:n_prefix]
        if len(toks) < n_prefix:
            return None
        return " ".join(t.lower() for t in toks)

    findings: list[Finding] = []
    i = 0
    while i < len(sents):
        pref = _prefix(sents[i])
        if pref is None:
            i += 1
            continue
        j = i + 1
        while j < len(sents) and _prefix(sents[j]) == pref:
            j += 1
        run_len = j - i
        if run_len >= min_run:
            findings.append(
                Finding(
                    type="anaphora",
                    confidence=1.0,
                    rule_id="literary_device:anaphora.consecutive_sentence_opening",
                    extra={
                        "run_length": run_len,
                        "prefix": " ".join(word_tokens(sents[i])[:n_prefix]),
                        "sentences": sents[i:j],
                    },
                )
            )
        i = j
    return findings
