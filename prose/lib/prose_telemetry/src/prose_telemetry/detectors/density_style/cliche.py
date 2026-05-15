"""Cliché — exact-match common fiction clichés.

The default catalog ships in this module. Per-book additions via
`DetectorConfig.extra['additional_cliches']`.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_DEFAULT_CLICHES = (
    "at the end of the day", "all that glitters", "back to square one",
    "better safe than sorry", "burning the midnight oil", "by the skin of",
    "calm before the storm", "cat got your tongue", "cool as a cucumber",
    "cry over spilt milk", "dead as a doornail", "easy as pie",
    "every cloud has a silver lining", "fish out of water",
    "for what it's worth", "hit the nail on the head", "in the nick of time",
    "it's not rocket science", "needle in a haystack",
    "only time will tell", "out of the blue", "piece of cake",
    "raining cats and dogs", "read between the lines", "see the light",
    "the calm before", "the apple of his eye", "the apple of her eye",
    "think outside the box", "thinking outside the box", "tip of the iceberg",
    "tomorrow is another day", "two birds with one stone",
    "when push comes to shove", "with bated breath", "writing on the wall",
    "a stitch in time", "all in a day's work", "all walks of life",
    "as luck would have it", "avoid like the plague",
    "between a rock and a hard place", "beyond the pale",
    "blood is thicker than", "calm as a hindu cow", "diamond in the rough",
    "dyed in the wool", "easier said than done", "every fiber of my being",
    "fall by the wayside", "fall on deaf ears", "from the get-go",
    "gentle as a lamb", "grass is always greener", "in the same boat",
    "last but not least", "let the cat out of the bag", "lock, stock, and barrel",
    "lost in the shuffle", "make a long story short", "no pain, no gain",
    "off the beaten path", "on the wrong side of the bed",
    "play it by ear", "pull yourself up by your bootstraps",
    "put two and two together", "rolling in the dough",
    "sharp as a tack", "stick out like a sore thumb",
)


@register(
    name="cliche",
    tier="stdlib",
    family="literary_device",
    description="Exact-match common fiction clichés.",
)
def detect_cliches(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    phrases = tuple(_DEFAULT_CLICHES) + tuple(config.extra.get("additional_cliches", []))
    low = prose.lower()
    findings: list[Finding] = []
    for phrase in phrases:
        if phrase in low:
            for m in re.finditer(re.escape(phrase), low):
                findings.append(
                    Finding(
                        type="cliche",
                        confidence=1.0,
                        rule_id="literary_device:cliche.exact_match",
                        span=(m.start(), m.start() + len(phrase)),
                        extra={"phrase": phrase},
                    )
                )
    return findings
