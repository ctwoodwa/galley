"""prose-telemetry — spaCy-tier detectors for literary-device telemetry.

The CPU-tier (stdlib) detectors live in the book repo at
`the-inverted-stack/build/prose_telemetry_handcount.py`. This package adds
spaCy-tier detectors that require POS tagging and dependency parsing —
isocolon, distributed chiasmus, antithesis-within-sentence, and
nominalization density.

Public API:
    from prose_telemetry import load_nlp, analyze_chapter

    nlp = load_nlp()
    findings = analyze_chapter(nlp, 'path/to/chapter.md')
"""

from prose_telemetry.spacy_detectors import (
    load_nlp,
    analyze_chapter,
    detect_isocolon,
    detect_distributed_chiasmus,
    detect_nominalizations,
    detect_antithesis,
)

__all__ = [
    "load_nlp",
    "analyze_chapter",
    "detect_isocolon",
    "detect_distributed_chiasmus",
    "detect_nominalizations",
    "detect_antithesis",
]
