"""Convert spelled-out English number words to integers.

Handles cardinal numbers up to a few thousand. Used to interpret
prose like "ninety-three days" → 93, "twenty-three years" → 23,
"the fourth of November" → 4 (ordinal).
"""

from __future__ import annotations

import re

# Cardinal-number word mapping.
_UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19,
}
_TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
_SCALES = {"hundred": 100, "thousand": 1000, "million": 1_000_000}

# Ordinal mapping (1st, 2nd, ...).
_ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17,
    "eighteenth": 18, "nineteenth": 19, "twentieth": 20,
    "twenty-first": 21, "twenty-second": 22, "twenty-third": 23,
    "twenty-fourth": 24, "twenty-fifth": 25, "twenty-sixth": 26,
    "twenty-seventh": 27, "twenty-eighth": 28, "twenty-ninth": 29,
    "thirtieth": 30, "thirty-first": 31,
}


def parse_cardinal(text: str) -> int | None:
    """Parse a spelled-out cardinal number ('ninety-three', 'one hundred
    and two', 'twenty-three'). Returns None if not parseable."""
    s = text.lower().strip().replace(",", "").replace(" and ", " ")
    # Strip leading "a" / "an" (a hundred → 100)
    if s.startswith("a "):
        s = "one " + s[2:]
    elif s.startswith("an "):
        s = "one " + s[3:]
    # Split on whitespace + hyphens.
    parts = re.split(r"[\s-]+", s)
    if not parts:
        return None

    total = 0
    current = 0
    for p in parts:
        if not p:
            continue
        if p in _UNITS:
            current += _UNITS[p]
        elif p in _TENS:
            current += _TENS[p]
        elif p in _SCALES:
            scale = _SCALES[p]
            if current == 0:
                current = 1
            if scale >= 100:
                # hundred multiplies the current units, thousand+ adds to total
                if scale == 100:
                    current *= scale
                else:
                    total += current * scale
                    current = 0
        else:
            # Try as raw integer.
            try:
                current += int(p)
            except ValueError:
                return None
    return total + current


def parse_ordinal(text: str) -> int | None:
    """Parse a spelled-out ordinal ('fourth', 'twenty-third')."""
    s = text.lower().strip()
    if s in _ORDINALS:
        return _ORDINALS[s]
    # Numeric ordinals: 1st, 2nd, 3rd, 4th, ...
    m = re.match(r"^(\d+)(st|nd|rd|th)$", s)
    if m:
        return int(m.group(1))
    return None
