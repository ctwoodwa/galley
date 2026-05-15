"""Classical-rhetoric detector pack — migrated from handcount.

Four detectors covering canonical Greek-rhetoric figures, all of them
sentence-list-driven (split on the handcount-equivalent boundary regex
in `_common/text.split_sentences`):

  - `anaphora` — N+ consecutive sentences sharing first n_prefix words.
  - `asyndeton` — comma-separated list with no terminal conjunction.
  - `polysyndeton` — 3+ 'and'/'or' within one sentence.
  - `literal_tricolon` — "X, Y, and/or Z" serial-comma pattern.

These were stdlib detectors in `prose_telemetry_handcount.py` until
the Phase 8 batch-1 migration. They now register under
`family='literary_device', tier='stdlib'` and honor `DetectorConfig`
threshold knobs (min_run, min_items, min_conjunctions) via
`DetectorConfig.extra`.

Importing this package auto-registers all four detectors.
"""

from prose_telemetry.detectors.classical_rhetoric import (  # noqa: F401
    anaphora,
    asyndeton,
    literal_tricolon,
    polysyndeton,
)

__all__ = ["anaphora", "asyndeton", "literal_tricolon", "polysyndeton"]
