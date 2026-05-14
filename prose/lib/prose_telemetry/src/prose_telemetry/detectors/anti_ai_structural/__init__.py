"""Structural anti-AI detector pack.

Six markdown-aware detectors for anti-AI-tells patterns that depend on
document or sentence STRUCTURE rather than on a lexical lookup:

- `ing_tail_phrases` (anti-AI #3) — sentence-tail participial clauses
  like `, highlighting the importance of …`.
- `rule_of_three_overuse` (anti-AI #10) — paragraphs where every list
  has exactly three items.
- `false_ranges` (anti-AI #12) — "from X to Y" where X and Y are not
  on a meaningful scale (heuristic).
- `inline_header_bullets` (anti-AI #16) — list items that open with
  `**Bold:** description`.
- `title_case_headings` (anti-AI #17) — markdown headings using Title
  Case rather than sentence case.
- `fragmented_headers` (anti-AI #29) — heading followed by a short
  paragraph that restates the heading's words.

Importing this package auto-registers all six detectors under
family='anti_ai', tier='structural'.
"""

from prose_telemetry.detectors.anti_ai_structural import (  # noqa: F401
    false_ranges,
    fragmented_headers,
    ing_tail_phrases,
    inline_header_bullets,
    rule_of_three_overuse,
    title_case_headings,
)

__all__ = [
    "false_ranges",
    "fragmented_headers",
    "ing_tail_phrases",
    "inline_header_bullets",
    "rule_of_three_overuse",
    "title_case_headings",
]
