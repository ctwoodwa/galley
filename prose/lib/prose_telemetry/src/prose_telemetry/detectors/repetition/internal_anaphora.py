"""Internal anaphora — same content word starting 3+ clauses in one sentence.

Migrated from `prose_telemetry_handcount.py`. Splits each sentence on
`, ; — –` and checks for consecutive runs of clauses opening with the
same word. Function-word starts (`the`, `which`, …) are excluded —
those are intentional Bobiverse parallelism, not looping.

Configurable threshold:
  - `min_repeats` (int, default 3) — minimum consecutive clauses
    opening with the same word to flag.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_CLAUSE_BOUNDARY = re.compile(r"\s*[,;—–]\s*")
_FUNCTION_STARTS = {
    "the", "a", "an", "this", "that", "these", "those", "which", "who", "whom",
    "and", "but", "or", "nor", "so", "yet", "for",
    "to", "of", "in", "on", "at", "by", "from", "with",
    "i", "he", "she", "it", "we", "they", "you",
    "is", "was", "are", "were", "be", "been",
    "his", "her", "their", "my", "your", "our",
}


@register(
    name="internal_anaphora",
    tier="stdlib",
    family="literary_device",
    description="Same content word starting 3+ clauses within one sentence.",
)
def detect_internal_anaphora(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_repeats = int(config.extra.get("min_repeats", 3))

    findings: list[Finding] = []
    for sent in split_sentences(prose):
        parts = _CLAUSE_BOUNDARY.split(sent)
        if len(parts) < min_repeats:
            continue
        first_words = []
        for p in parts:
            ws = word_tokens(p)
            if ws:
                first_words.append(ws[0].lower())
        run = 1
        for i in range(1, len(first_words)):
            w = first_words[i]
            if (
                w == first_words[i - 1]
                and len(w) >= 3
                and w not in _FUNCTION_STARTS
            ):
                run += 1
                if run >= min_repeats:
                    findings.append(
                        Finding(
                            type="internal_anaphora",
                            confidence=0.85,
                            rule_id="literary_device:internal_anaphora.clause_echo",
                            extra={
                                "word": w,
                                "run_length": run,
                                "sentence": sent,
                            },
                        )
                    )
                    break
            else:
                run = 1
    return findings
