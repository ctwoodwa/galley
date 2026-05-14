"""Tests for the anti-AI lexical detector pack.

Verifies the 10 yaml-defined detectors auto-register on import and fire
correctly on the non-book fixtures. Fixture B (technical-nonfiction with
deliberate copula avoidance + signposting) should produce many hits;
fixture A (anaphora-cascade literary fiction) should produce few.
"""

from __future__ import annotations

import pytest

from prose_telemetry._common import discover, get, registry as _registry
from prose_telemetry._common.types import DetectorConfig

# Importing the package auto-registers all 10 lexical detectors.
import prose_telemetry.detectors.anti_ai_lexical  # noqa: F401


EXPECTED_DETECTORS = {
    "ai_vocab_cluster",
    "collaborative_artifact",
    "copula_avoidance",
    "generic_positive_conclusion",
    "knowledge_cutoff_disclaimer",
    "persuasive_authority_trope",
    "significance_puffery",
    "signposting",
    "travel_brochure",
    "vague_attribution",
}


# ─── Registration ──────────────────────────────────────────────────────────


def test_all_ten_detectors_register():
    # Filter by tier='lexical' to scope to the Phase 2 pack — Phase 3+
    # adds proselint (also family='anti_ai' but tier='lexical' too) and
    # Phase 6 adds structural detectors (family='anti_ai' tier='structural').
    entries = discover(family="anti_ai", tier="lexical")
    names = {e.name for e in entries if not e.name == "proselint"}
    assert names == EXPECTED_DETECTORS, (
        f"Missing: {EXPECTED_DETECTORS - names}; Extra: {names - EXPECTED_DETECTORS}"
    )


def test_each_detector_has_tier_lexical():
    for name in EXPECTED_DETECTORS:
        entry = get(name)
        assert entry is not None, f"{name} not registered"
        assert entry.tier == "lexical"
        assert entry.family == "anti_ai"


def test_each_detector_has_description():
    for name in EXPECTED_DETECTORS:
        entry = get(name)
        assert entry is not None
        assert entry.description, f"{name} has empty description"


def test_each_detector_records_marker_count_metadata():
    for name in EXPECTED_DETECTORS:
        entry = get(name)
        assert entry is not None
        assert entry.metadata.get("marker_count", 0) > 0


# ─── Detection against fixture B (lots of patterns) ────────────────────────


def test_copula_avoidance_fires_on_non_book_b(non_book_b_sample):
    """Fixture B has deliberate copula-avoidance prose."""
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("copula_avoidance")
    assert entry is not None
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 5, f"expected ≥5 hits, got {len(findings)}"
    # Spot-check: at least one finding matches one of the expected markers.
    texts = [f.text.lower() for f in findings]
    assert any("serves as" in t for t in texts)


def test_signposting_fires_on_non_book_b(non_book_b_sample):
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("signposting")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 2
    texts = " ".join(f.text.lower() for f in findings)
    assert "dive into" in texts or "what you need to know" in texts


def test_persuasive_authority_trope_fires_on_non_book_b(non_book_b_sample):
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("persuasive_authority_trope")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 2


def test_significance_puffery_fires_on_non_book_b(non_book_b_sample):
    """'marks a pivotal moment' should hit."""
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("significance_puffery")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 1


def test_ai_vocab_cluster_fires_on_non_book_b(non_book_b_sample):
    """'showcases', 'evolving landscape', etc. should hit."""
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("ai_vocab_cluster")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 2


# ─── Quiet on clean prose (fixture A) ──────────────────────────────────────


def test_no_collaborative_artifacts_on_non_book_a(non_book_a_sample):
    """Fixture A is literary fiction — no chatbot residue."""
    text = non_book_a_sample.read_text(encoding="utf-8")
    entry = get("collaborative_artifact")
    findings = entry.fn(text, config=DetectorConfig())
    assert findings == []


def test_no_knowledge_cutoff_disclaimer_on_non_book_a(non_book_a_sample):
    text = non_book_a_sample.read_text(encoding="utf-8")
    entry = get("knowledge_cutoff_disclaimer")
    findings = entry.fn(text, config=DetectorConfig())
    assert findings == []


def test_no_signposting_on_non_book_a(non_book_a_sample):
    text = non_book_a_sample.read_text(encoding="utf-8")
    entry = get("signposting")
    findings = entry.fn(text, config=DetectorConfig())
    assert findings == []


# ─── Config knobs ──────────────────────────────────────────────────────────


def test_disabled_config_returns_no_findings(non_book_b_sample):
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("copula_avoidance")
    cfg = DetectorConfig(enabled=False)
    findings = entry.fn(text, config=cfg)
    assert findings == []


def test_min_confidence_filters_low_confidence_detectors(non_book_b_sample):
    """ai_vocab_cluster has confidence 0.6; with min_confidence=0.8 it
    should be suppressed entirely."""
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("ai_vocab_cluster")
    cfg = DetectorConfig(min_confidence=0.8)
    findings = entry.fn(text, config=cfg)
    assert findings == []


def test_finding_carries_rule_id_and_metadata(non_book_b_sample):
    text = non_book_b_sample.read_text(encoding="utf-8")
    entry = get("copula_avoidance")
    findings = entry.fn(text, config=DetectorConfig())
    f = findings[0]
    assert f.rule_id == "lexical:copula_avoidance"
    assert f.span is not None
    assert f.extra.get("family") == "anti_ai"
    assert f.extra.get("severity_hint") == "warning"


# ─── Empty-input behavior ──────────────────────────────────────────────────


def test_empty_prose_returns_no_findings():
    for name in EXPECTED_DETECTORS:
        entry = get(name)
        findings = entry.fn("", config=DetectorConfig())
        assert findings == [], f"{name} fired on empty prose"
