"""Motif-overuse detector — retired + capped phrase lists from BookProfile.

Combines two related anti-patterns the legacy handcount split into one
detector:

- **Retired motifs.** Phrases that should never appear in a book's
  prose. Any occurrence is a finding (typically a blocker by the time
  the verdict layer sees it). Source:
  `BookProfile.detectors.motif_overuse.retired_motifs` — list of
  exact phrases.
- **Capped motifs.** Phrases allowed at most N times per chapter.
  Findings emit for every occurrence past the cap. Source:
  `BookProfile.detectors.motif_overuse.motifs` — dict of phrase →
  max-allowed-count.

Both sources are book-specific. Anna's profile carries the lists
extracted from the legacy handcount `RETIRED_MOTIFS` and `CAPPED_MOTIFS`
constants. A non-Anna book with empty config gets zero findings.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


def _find_all(prose: str, phrase: str) -> list[re.Match[str]]:
    pattern = re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
    return list(pattern.finditer(prose))


@register(
    name="motif_overuse",
    tier="stdlib",
    family="voice",
    description=(
        "Retired-phrase + capped-phrase motif detection. Lists lifted "
        "from the book's profile under detectors.motif_overuse."
    ),
    metadata={"config_source": "BookProfile.detectors.motif_overuse.{retired_motifs,motifs}"},
)
def detect_motif_overuse(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []

    # Retired motifs: every occurrence is a finding.
    for phrase in config.retired_motifs:
        for m in _find_all(prose, phrase):
            findings.append(
                Finding(
                    type="motif_overuse",
                    confidence=1.0,
                    rule_id="voice:motif_overuse.retired",
                    span=(m.start(), m.end()),
                    text=m.group(0),
                    extra={
                        "family": "voice",
                        "phrase": phrase,
                        "status": "retired",
                        "cap": 0,
                    },
                )
            )

    # Capped motifs: findings only for occurrences past the cap.
    for phrase, cap in config.motifs.items():
        matches = _find_all(prose, phrase)
        if len(matches) <= cap:
            continue
        # Emit one finding per over-cap occurrence so the verdict layer
        # can count them. We attach the same `occurrence_count` to each
        # so dashboards can dedup by phrase if they want.
        for m in matches[cap:]:
            findings.append(
                Finding(
                    type="motif_overuse",
                    confidence=1.0,
                    rule_id="voice:motif_overuse.capped",
                    span=(m.start(), m.end()),
                    text=m.group(0),
                    extra={
                        "family": "voice",
                        "phrase": phrase,
                        "status": "capped",
                        "cap": cap,
                        "occurrence_count": len(matches),
                    },
                )
            )

    return findings
