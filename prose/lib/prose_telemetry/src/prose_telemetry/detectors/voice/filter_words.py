"""Filter-words detector — narrator-distance verbs lifted from BookProfile.

Detects constructions of the form `I <verb>` where `<verb>` is one of
the narrator-filter verbs the book's profile flags as a distancing
move. These distance the reader from the sensory present and accumulate
into a measurable narrative-distance signal.

Heavy use is a formal-narrator move (Janeway-style staff history);
direct-narration registers (Bobiverse) tend to drop them. Anna's
profile carries the canonical list extracted from the legacy handcount
script's `_FILTER_VERBS` regex.

Config source: `BookProfile.detectors.filter_words.filter_words` —
list of verb stems. Empty list → zero findings.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


def _compile_pattern(verbs: list[str]) -> re.Pattern[str] | None:
    """Build the regex `\\bI\\s+(verb1|verb2|...)\\b` from the verb list.

    Returns None when the verb list is empty (calling re.compile on an
    empty alternation matches every position and would produce nonsense).
    """
    if not verbs:
        return None
    alternation = "|".join(re.escape(v) for v in verbs)
    return re.compile(rf"\bI\s+({alternation})\b", re.IGNORECASE)


@register(
    name="filter_words",
    tier="stdlib",
    family="voice",
    description=(
        "Narrator-distance verbs ('I felt X', 'I noticed X'). Verb list "
        "lifted from the book's profile under detectors.filter_words.filter_words."
    ),
    metadata={"config_source": "BookProfile.detectors.filter_words.filter_words"},
)
def detect_filter_words(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    pattern = _compile_pattern(list(config.filter_words))
    if pattern is None:
        return []

    findings: list[Finding] = []
    for m in pattern.finditer(prose):
        findings.append(
            Finding(
                type="filter_words",
                confidence=1.0,
                rule_id="voice:filter_words",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "voice",
                    "verb": m.group(1).lower(),
                },
            )
        )
    return findings
