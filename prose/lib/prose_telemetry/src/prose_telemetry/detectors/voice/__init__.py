"""Voice-calibrated detector pack — config-driven from BookProfile.

The detectors in this package take their phrase / verb / motif lists
from `BookProfile.detectors.<name>.<field>` rather than from hard-coded
constants. A book with an empty config gets zero findings from each
detector. A book whose profile populates the lists gets findings on
the patterns it declared.

This is the Phase 4 multi-book-support layer. The legacy handcount
script keeps its hard-coded Anna constants for backward compatibility;
this pack is the path forward for new books (and for the-inverted-stack
once the migration shim flips over).

Detectors in this pack:

- `filter_words` — narrator-distance verbs ("I felt X", "I noticed X").
  List source: `BookProfile.detectors.filter_words.filter_words`.
- `motif_overuse` — combines retired-phrase blockers (any occurrence)
  and capped-phrase findings (occurrences past the per-book cap).
  Source: `BookProfile.detectors.motif_overuse.retired_motifs` and
  `.motifs` (dict of phrase → max allowed count).
- `self_referential_frame` — staff-history meta-phrases. Source:
  `BookProfile.detectors.self_referential_frame.self_referential_frames`.

Importing this package auto-registers all three detectors with the
central registry (family='voice').
"""

from prose_telemetry.detectors.voice import (  # noqa: F401
    filter_words,
    motif_overuse,
    self_referential_frame,
)

__all__ = ["filter_words", "motif_overuse", "self_referential_frame"]
