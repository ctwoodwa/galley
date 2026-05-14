"""Document-level aggregate metrics for galley/prose.

Aggregates are orthogonal to detector findings — they describe properties
of the whole chapter rather than per-span events. Each module exposes one
or more `compute_*` functions returning a dict suitable for inclusion in
the prose-metrics.json `document_metrics` section.

Available aggregates:

- readability: Flesch / Flesch-Kincaid / ARI / Gunning Fog / Coleman-Liau /
  SMOG / Dale-Chall + syllable counts (via textstat).
- rhythm: sentence-length CV, em-dash density per paragraph, dialogue /
  narration ratio.

Future:
- voice_fingerprint: stylometric feature vector (Phase 9).
- prosody: phoneme-level stress patterns (via pronouncing/CMU dict; Phase 3).
"""

from prose_telemetry.aggregates.readability import compute_readability
from prose_telemetry.aggregates.rhythm import (
    compute_dialogue_narration_ratio,
    compute_em_dash_density,
    compute_rhythm,
    compute_sentence_length_cv,
)

__all__ = [
    "compute_readability",
    "compute_rhythm",
    "compute_sentence_length_cv",
    "compute_em_dash_density",
    "compute_dialogue_narration_ratio",
]
