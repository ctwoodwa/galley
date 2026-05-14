"""Extract factual claims from prose.

Extractors return lists of structured dicts. Each finding has:
  - type: e.g. 'date', 'duration', 'age', 'relationship'
  - value: the extracted value (date, int, string)
  - source_text: the actual text matched
  - char_offset: start position in the source

The extractors are intentionally permissive — they accept partial info
and the validator does the cross-checking. False positives are reviewed
by the author.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from story_canon.numwords import parse_cardinal, parse_ordinal

# ─── Date extractors ─────────────────────────────────────────────────────

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5,
    "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_PATTERN = "|".join(sorted(_MONTHS.keys(), key=len, reverse=True))

# Forms we recognize:
#   "the fourth of November"
#   "the fourteenth of February"
#   "November 4"
#   "Nov. 4"
#   "February 14, 2026"
_DATE_PATTERNS = [
    # the FOURTH of NOVEMBER
    re.compile(
        r"\bthe\s+([a-z]+(?:-[a-z]+)?)\s+of\s+(" + _MONTH_PATTERN + r")\b(?:[,\s]+(\d{4}))?",
        re.IGNORECASE,
    ),
    # NOVEMBER 4 / Nov. 4
    re.compile(
        r"\b(" + _MONTH_PATTERN + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:[,\s]+(\d{4}))?",
        re.IGNORECASE,
    ),
]


def extract_dates(prose: str) -> list[dict[str, Any]]:
    """Extract date mentions. Returns list of {type, day, month, year,
    source_text, char_offset}."""
    findings: list[dict] = []
    seen_spans: set[tuple[int, int]] = set()

    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(prose):
            span = (m.start(), m.end())
            if span in seen_spans:
                continue
            groups = m.groups()
            day_word = groups[0]
            month_word = groups[1]
            year_str = groups[2] if len(groups) > 2 and groups[2] else None
            day_int = parse_ordinal(day_word)
            if day_int is None:
                try:
                    day_int = int(day_word)
                except (ValueError, TypeError):
                    continue
            month_int = _MONTHS.get(month_word.lower().rstrip("."))
            if month_int is None:
                continue
            findings.append({
                "type": "date",
                "day": day_int,
                "month": month_int,
                "year": int(year_str) if year_str else None,
                "source_text": m.group(0),
                "char_offset": m.start(),
            })
            seen_spans.add(span)
    return findings


# ─── Duration extractors ────────────────────────────────────────────────

# Explicit number-word list keeps the regex from greedily matching
# conjunctions / prepositions as part of the number phrase (e.g., "and
# ninety-three" was matching but failing to parse).
_NUMBER_WORDS = (
    r"(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|"
    r"eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|"
    r"eighty|ninety|hundred|thousand|million)"
)

# Examples we catch:
#   "ninety-three days"
#   "twenty-three years"
#   "eleven years"
#   "ninety-six days"
#   "five months"
#   "four years"
#   "nine days"
#   "one hundred and two days"
_DURATION_RE = re.compile(
    r"\b(" + _NUMBER_WORDS + r"(?:[-\s]+(?:and\s+)?" + _NUMBER_WORDS + r"){0,5})\s+"
    r"(days?|weeks?|months?|years?|decades?|hours?|minutes?|seconds?)\b",
    re.IGNORECASE,
)


def extract_durations(prose: str) -> list[dict[str, Any]]:
    """Extract spelled-out duration mentions. Returns
    {type, value, unit, source_text, char_offset}."""
    findings: list[dict] = []
    for m in _DURATION_RE.finditer(prose):
        num_text, unit_text = m.group(1), m.group(2).lower().rstrip("s")
        # Parse the number.
        n = parse_cardinal(num_text.strip())
        if n is None or n == 0:
            continue
        findings.append({
            "type": "duration",
            "value": n,
            "unit": unit_text,
            "source_text": m.group(0),
            "char_offset": m.start(),
        })
    return findings


# ─── Age extractors ─────────────────────────────────────────────────────

_AGE_RE = re.compile(
    r"\b(was|am|is|were|are)\s+([a-z]+(?:-[a-z]+)?)\s*(?:years?\s+old|"
    r"(?=[,.\s]))",
    re.IGNORECASE,
)


def extract_ages(prose: str, min_age: int = 1, max_age: int = 110) -> list[dict[str, Any]]:
    """Extract 'was X (years old)' constructions where X is a spelled-out
    cardinal that could plausibly be an age."""
    findings: list[dict] = []
    for m in _AGE_RE.finditer(prose):
        verb, num_text = m.group(1), m.group(2)
        n = parse_cardinal(num_text)
        if n is None or not (min_age <= n <= max_age):
            continue
        findings.append({
            "type": "age",
            "verb": verb.lower(),
            "value": n,
            "source_text": m.group(0),
            "char_offset": m.start(),
        })
    return findings


# ─── Relationship extractors ────────────────────────────────────────────

_REL_RE = re.compile(
    r"\b(my|her|his|their|our|the)\s+(brother|sister|mother|father|"
    r"daughter|son|aunt|uncle|niece|nephew|grandmother|grandfather|"
    r"granddaughter|grandson|cousin|wife|husband|ex-husband|ex-wife|spouse)\b",
    re.IGNORECASE,
)


def extract_relationships(prose: str) -> list[dict[str, Any]]:
    """Extract relationship mentions ('my brother', 'her father')."""
    findings: list[dict] = []
    for m in _REL_RE.finditer(prose):
        possessive, role = m.group(1).lower(), m.group(2).lower()
        findings.append({
            "type": "relationship",
            "possessive": possessive,
            "role": role,
            "source_text": m.group(0),
            "char_offset": m.start(),
        })
    return findings


# ─── Helper: date arithmetic ────────────────────────────────────────────

def days_between(d1: date, d2: date) -> int:
    """Absolute number of days between two dates."""
    return abs((d2 - d1).days)
