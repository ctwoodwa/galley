"""Repetition + echo + self-correction detector pack — Phase 8 batch 2a.

Migrated from `prose_telemetry_handcount.py`. Four detectors covering
the "echo / repeat / pivot" cluster of devices:

  - `anadiplosis`        — last word of clause A = first word of clause B
                           (often a dramatic / Janeway move).
  - `internal_anaphora`  — same content word starting 3+ comma/em-dash
                           clauses within a single sentence.
  - `epanorthosis`       — "*not X — Y*" self-correction pattern.
  - `echo_and_confirm`   — a generic rule sentence ("if you X") followed
                           by a short personal-pronoun confirmation
                           sentence that echoes a content word from the
                           rule.
  - `redundant_explicit_predicate` — a short echo sentence ("I was not
                           disappointed.") that re-states a predicate
                           already set up in the prior sentence ("...was
                           prepared to be disappointed by it."); trim
                           form ("I was not.") is the calibrated rewrite.
                           Family: `voice` (craft / register defect).

All register as `family='literary_device', tier='stdlib'` except
`redundant_explicit_predicate` which is `family='voice'`. Honor
`DetectorConfig.enabled` + the same per-detector knobs the handcount
versions exposed via positional defaults (now via
`DetectorConfig.extra`).
"""

from prose_telemetry.detectors.repetition import (  # noqa: F401
    anadiplosis,
    echo_and_confirm,
    epanorthosis,
    internal_anaphora,
    redundant_explicit_predicate,
)

__all__ = [
    "anadiplosis",
    "echo_and_confirm",
    "epanorthosis",
    "internal_anaphora",
    "redundant_explicit_predicate",
]
