"""Echo-and-confirm — generic rule sentence followed by short personal echo.

Migrated from `prose_telemetry_handcount.py`. The textbook case:
'if you let it. I had let it.' — a conditional rule sentence followed
by a ≤6-word personal-pronoun sentence that shares a content-word
stem with the rule.

Heuristic, confidence 0.7. Same regex / opener set / stem-trimming as
the handcount version so counts match the baseline.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


# Rule markers — tightened to avoid "if you like / if you happen to /
# if you need to" parenthetical permissions which are NOT generic rules.
_RULE_MARKERS = re.compile(
    r"\b(if you (?!like|happen|wish|prefer|please|will|are\s+going|need|want)"
    r"|when you (?!are|were)"
    r"|you do not|you don't|if one(?!\s+of)"
    r"|the kind of (?:thing|person|man|woman|decision|note|feeling) that)\b",
    re.IGNORECASE,
)
_CONFIRM_OPENERS = {"i", "we", "my", "she", "he"}
_ECHO_STOPWORDS = {
    "have", "been", "this", "that", "with", "from", "they", "them",
    "their", "which", "would", "could", "should", "about", "there",
}


def _content_words(text: str, min_len: int = 4) -> set[str]:
    """Lowercase content words at least `min_len` chars, excluding
    common stopwords."""
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z][A-Za-z'-]{%d,}" % (min_len - 1), text)
        if w.lower() not in _ECHO_STOPWORDS
    }


def _stem(w: str) -> str:
    """Strip simple verb/plural suffixes for loose lemma matching."""
    for suffix in ("ing", "ed", "es", "s"):
        if w.endswith(suffix) and len(w) > len(suffix) + 2:
            return w[: -len(suffix)]
    return w


@register(
    name="echo_and_confirm",
    tier="stdlib",
    family="literary_device",
    description="Generic rule then short personal echo sharing a content stem.",
)
def detect_echo_and_confirm(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    sents = split_sentences(prose)
    findings: list[Finding] = []
    for i in range(len(sents) - 1):
        rule_s = sents[i]
        confirm_s = sents[i + 1].strip()
        if not _RULE_MARKERS.search(rule_s):
            continue
        confirm_words = word_tokens(confirm_s)
        if not (2 <= len(confirm_words) <= 6):
            continue
        if confirm_words[0].lower() not in _CONFIRM_OPENERS:
            continue
        rule_content = _content_words(rule_s)
        confirm_content = _content_words(confirm_s, min_len=3)
        rule_stems = {_stem(w) for w in rule_content}
        confirm_stems = {_stem(w) for w in confirm_content}
        shared = rule_stems & confirm_stems
        if shared:
            findings.append(
                Finding(
                    type="echo_and_confirm",
                    confidence=0.7,
                    rule_id="literary_device:echo_and_confirm.rule_then_personal",
                    extra={
                        "rule_sentence": rule_s,
                        "confirm_sentence": confirm_s,
                        "shared_stems": sorted(shared),
                    },
                )
            )
    return findings
