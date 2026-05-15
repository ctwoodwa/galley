"""Grammar/mechanics detector pack — Phase 8 batch 5.

Eight detectors covering register / grammar / mechanics markers:

  - passive_voice           — be-verb + past participle heuristic.
  - expletive_construction  — "There is / It was" weak openers.
  - conjunction_start       — sentences opening with And/But/So.
  - conjunctive_adverb      — academic-register linkers (however, therefore).
  - double_negative         — proximity-matched not/never patterns.
  - comma_splice            — pronoun+verb after comma without conjunction.
  - infinitive_phrase       — "to <verb>" density.
  - gerund                  — -ing density (excluding common non-gerunds).

All register under `family='literary_device', tier='stdlib'`.
"""

from prose_telemetry.detectors.grammar_mechanics import (  # noqa: F401
    comma_splice,
    conjunction_start,
    conjunctive_adverb,
    double_negative,
    expletive_construction,
    gerund,
    infinitive,
    passive_voice,
)

__all__ = [
    "comma_splice",
    "conjunction_start",
    "conjunctive_adverb",
    "double_negative",
    "expletive_construction",
    "gerund",
    "infinitive",
    "passive_voice",
]
