"""story-canon — continuity verification for fiction."""

from story_canon.validator import validate_chapter, load_canon
from story_canon.extractors import (
    extract_dates,
    extract_durations,
    extract_ages,
    extract_relationships,
)

__all__ = [
    "validate_chapter",
    "load_canon",
    "extract_dates",
    "extract_durations",
    "extract_ages",
    "extract_relationships",
]
