"""Pivot + inference detector pack — Phase 8 batch 3.

Four detectors migrated from `prose_telemetry_handcount.py`:

  - `tautological_self_equation` — regex: 'the X was the X' and
                                    grammatical variants.
  - `statement_then_reversal`    — consecutive sentence pair where
                                    the second opens with a reversal
                                    marker (but / yet / however / …).
                                    Dialogue interiors excluded.
  - `confirmation_tag`           — sentence-final ', which she was.'
                                    style anti-AI confirmation tags.
  - `inference_cascade`          — three-or-more 'which <same-verb>'
                                    clause openers inside one
                                    sentence (Bobiverse cascade move).

All four register as `family='literary_device', tier='stdlib'`.
"""

from prose_telemetry.detectors.pivot_inference import (  # noqa: F401
    confirmation_tag,
    inference_cascade,
    statement_then_reversal,
    tautology,
)

__all__ = [
    "confirmation_tag",
    "inference_cascade",
    "statement_then_reversal",
    "tautology",
]
