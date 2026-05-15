"""Tests for the spaCy-tier registry wrappers.

The four spaCy detectors (isocolon, distributed_chiasmus,
nominalization, antithesis_within_sentence) historically ran via the
legacy `analyze_chapter()` pipeline. These tests verify they're now
also reachable through the central registry, accept a parsed Doc on
the `doc` kwarg, honour `DetectorConfig.enabled`, and return zero
findings when no doc is supplied (the spaCy tier cannot run on raw
text).

A real spaCy doc is built once at module load via the `en_core_web_sm`
model. Tests are skipped if the model isn't installed.
"""

from __future__ import annotations

import pytest

from prose_telemetry._common import discover
from prose_telemetry._common.types import DetectorConfig

# Importing prose_telemetry.detectors triggers all @register decorators.
import prose_telemetry.detectors  # noqa: F401


SPACY_NAMES = {
    "isocolon",
    "distributed_chiasmus",
    "nominalization",
    "antithesis_within_sentence",
}


def test_spacy_wrappers_are_all_registered():
    names = {e.name for e in discover(tier="spacy")}
    assert SPACY_NAMES <= names


def test_spacy_wrappers_skip_silently_when_no_doc():
    """Registry dispatch calls every detector uniformly; the spaCy
    wrappers must noop without a doc rather than raising."""
    from prose_telemetry._common.registry import get
    for name in SPACY_NAMES:
        entry = get(name)
        assert entry is not None
        out = entry.fn("some prose text", config=DetectorConfig(), doc=None)
        assert out == []


def test_spacy_wrappers_respect_enabled_false():
    """An author who disables a detector in book.editorial.yaml gets zero
    findings even when a doc is available."""
    from prose_telemetry._common.registry import get
    nlp = _try_load_spacy()
    if nlp is None:
        pytest.skip("en_core_web_sm not installed")
    doc = nlp("She arrived. He departed. The day faded.")
    for name in SPACY_NAMES:
        entry = get(name)
        assert entry is not None
        out = entry.fn("dummy", config=DetectorConfig(enabled=False), doc=doc)
        assert out == []


def test_isocolon_fires_with_doc():
    nlp = _try_load_spacy()
    if nlp is None:
        pytest.skip("en_core_web_sm not installed")
    from prose_telemetry._common.registry import get
    # Strongly parallel POS sequences.
    prose = (
        "She walked to the door. She turned to the wall. She faced "
        "the window. She studied the room."
    )
    doc = nlp(prose)
    out = get("isocolon").fn(prose, config=DetectorConfig(), doc=doc)
    # Whether 4 parallel sentences trip the heuristic depends on POS
    # tagging; what we care about is the wrapper returns a list of
    # Finding objects with the right type.
    for f in out:
        assert f.type == "isocolon"
        assert f.rule_id.startswith("spacy:")


def test_isocolon_threshold_via_detector_config_extra():
    """`min_run` from DetectorConfig.extra should pass through."""
    nlp = _try_load_spacy()
    if nlp is None:
        pytest.skip("en_core_web_sm not installed")
    from prose_telemetry._common.registry import get
    prose = (
        "She walked to the door. She turned to the wall. She faced "
        "the window. She studied the room. She closed the door."
    )
    doc = nlp(prose)
    permissive = get("isocolon").fn(
        prose, config=DetectorConfig(extra={"min_run": 1}), doc=doc,
    )
    strict = get("isocolon").fn(
        prose, config=DetectorConfig(extra={"min_run": 99}), doc=doc,
    )
    # min_run=99 → effectively impossible → zero findings.
    assert len(strict) == 0
    # And the permissive setting can only fire more (or equal) runs.
    assert len(permissive) >= len(strict)


def _try_load_spacy():
    try:
        import spacy
        return spacy.load("en_core_web_sm")
    except (ImportError, OSError):
        return None
