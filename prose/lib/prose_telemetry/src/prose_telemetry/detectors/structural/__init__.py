"""Structural / proximity / nouns / time pack — Phase 8 batch 6 (final).

Six detectors closing out the handcount→registry migration:

  - direct_address           — narrator addressing the reader directly.
  - timestamp                — HH:MM time stamps in narration.
  - temporal_marker          — narrative-time adverbs (then, now, soon).
  - paragraph_opener_repeat  — same word opening 3+ paragraphs.
  - proper_noun              — mid-sentence capitalized words (density).
  - proximity_echo           — content word echoed within sentence (≤12 tokens).

All register under `family='literary_device', tier='stdlib'`. With this
pack landed, the book repo's `prose_telemetry_handcount.py` retires
entirely.
"""

from prose_telemetry.detectors.structural import (  # noqa: F401
    direct_address,
    paragraph_opener_repeat,
    proper_noun,
    proximity_echo,
    temporal_marker,
    timestamp,
)

__all__ = [
    "direct_address",
    "paragraph_opener_repeat",
    "proper_noun",
    "proximity_echo",
    "temporal_marker",
    "timestamp",
]
