"""Phoneme-level sonic-device detectors for galley/prose.

Three detectors that use the CMU pronouncing dictionary (via the
`pronouncing` library, BSD-2) to identify phonemic patterns rather than
orthographic ones:

- `alliteration` — runs of 3+ consecutive content words sharing the same
  initial consonant phoneme.
- `assonance` — repeated vowel phonemes within a sliding window
  (informational; texture-level metric).
- `consonance` — repeated consonant phonemes within a sliding window
  (informational; texture-level metric).

Importing this package registers all three detectors with the central
registry (tier='stdlib', family='sonics').
"""

from prose_telemetry.detectors.sonics import (  # noqa: F401
    alliteration,
    assonance,
    consonance,
)

__all__ = ["alliteration", "assonance", "consonance"]
