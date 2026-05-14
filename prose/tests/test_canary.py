"""Phase 1 canary test — verifies the foundation lands.

If this test passes, the lib/_common types load, the registry import is
clean, the book-profile yaml schemas parse round-trip, and the multi-book
property holds (non_book_a and non_book_b are distinct profiles).

The Phase 1 success criteria for galley/prose include:

- `lib/_common/` types: Finding, DetectorConfig, BookProfile, Verdict.
- Detector autodiscovery registry exists and is empty-or-populated cleanly.
- Non-book test fixtures (`non_book_a`, `non_book_b`) load and behave
  distinctly per-book.

This test exercises exactly those properties. It does NOT run actual
detectors yet — that's covered in later-phase tests when the registry
gets its first registered detector.
"""

from __future__ import annotations

from prose_telemetry._common import (
    BookProfile,
    ComputeConfig,
    DetectorConfig,
    Finding,
    Verdict,
    DetectorEntry,
    discover,
    register,
    get,
)
from prose_telemetry._common import registry as _registry


# ─── Type contract sanity ──────────────────────────────────────────────────


def test_finding_minimal_construction_works():
    f = Finding(type="anaphora", confidence=1.0, rule_id="stdlib:anaphora")
    assert f.type == "anaphora"
    assert f.confidence == 1.0
    assert f.span is None
    assert f.extra == {}


def test_finding_serializes_with_span_and_extra():
    f = Finding(
        type="anaphora",
        confidence=0.8,
        rule_id="stdlib:anaphora",
        span=(0, 42),
        text="The light came in low.",
        extra={"run_length": 3, "prefix": "The light"},
    )
    d = f.to_dict()
    assert d["type"] == "anaphora"
    assert d["confidence"] == 0.8
    assert d["start_char"] == 0
    assert d["end_char"] == 42
    assert d["text"] == "The light came in low."
    assert d["run_length"] == 3
    assert d["prefix"] == "The light"


def test_detector_config_defaults_are_sane():
    cfg = DetectorConfig()
    assert cfg.enabled is True
    assert cfg.warning_per_1k is None
    assert cfg.blocker_per_1k is None
    assert cfg.routing == "local"
    assert cfg.stopwords == []
    assert cfg.motifs == {}


def test_compute_config_defaults_match_local_first_commitments():
    """Per ADR-0007: default mode is fully local; remote is opt-in only."""
    c = ComputeConfig()
    assert c.gpu_mode == "auto"
    assert c.remote_base_url is None
    assert c.remote_auth_token_env == "GALLEY_API_TOKEN"
    assert c.cache_dir == "~/.galley/cache/prose"


def test_verdict_serialization_roundtrip():
    v = Verdict(
        verdict="yellow",
        blockers=[],
        warnings=["anaphora_density exceeds threshold"],
        passes=["polysyndeton"],
    )
    d = v.to_dict()
    v2 = Verdict.from_dict(d)
    assert v2.verdict == "yellow"
    assert v2.warnings == ["anaphora_density exceeds threshold"]
    assert v2.passes == ["polysyndeton"]


# ─── BookProfile loader ────────────────────────────────────────────────────


def test_inverted_stack_profile_loads(inverted_stack_profile):
    """The first-customer profile parses and exposes Anna identity."""
    p = inverted_stack_profile
    assert p.book_id == "the-inverted-stack"
    assert p.voice == "anna"
    assert p.genre == "literary-sf"
    assert p.held_lines_dir == "vol-2/act-1"
    assert p.compute.gpu_mode == "auto"
    assert p.compute.remote_base_url is None  # local-first default
    # Phase 4 populates the Anna-calibrated voice detectors.
    assert "filter_words" in p.detectors
    assert "motif_overuse" in p.detectors
    assert "self_referential_frame" in p.detectors
    # filter_words list is non-empty and contains canonical narrator-
    # distance verbs.
    fw = p.detector("filter_words")
    assert fw.enabled is True
    assert "felt" in fw.filter_words
    assert "noticed" in fw.filter_words
    # Retired motif list is non-empty.
    mo = p.detector("motif_overuse")
    assert len(mo.retired_motifs) >= 1
    assert len(mo.motifs) >= 1


def test_non_book_profiles_are_distinct(non_book_a_profile, non_book_b_profile):
    """The two synthetic profiles are operationally distinct — different
    book_ids, different detector overrides. This is the multi-book canary."""
    a = non_book_a_profile
    b = non_book_b_profile
    assert a.book_id == "non-book-a"
    assert b.book_id == "non-book-b"
    assert a.book_id != b.book_id
    assert a.genre != b.genre

    # Both override anaphora, but at different thresholds.
    assert "anaphora" in a.detectors
    assert "anaphora" in b.detectors
    a_ana = a.detectors["anaphora"]
    b_ana = b.detectors["anaphora"]
    assert a_ana.warning_per_1k != b_ana.warning_per_1k
    assert a_ana.warning_per_1k < b_ana.warning_per_1k  # A is strict, B is loose


def test_non_book_a_detector_lookup(non_book_a_profile):
    """The .detector(name) accessor returns the override when present,
    a default DetectorConfig when absent."""
    a = non_book_a_profile
    anaphora_cfg = a.detector("anaphora")
    assert anaphora_cfg.warning_per_1k == 5.0
    assert anaphora_cfg.blocker_per_1k == 12.0
    # Unknown detector falls back to defaults.
    unknown_cfg = a.detector("totally-not-a-real-detector")
    assert unknown_cfg.warning_per_1k is None
    assert unknown_cfg.enabled is True


def test_book_profile_roundtrip_via_dict():
    """to_dict() → from_dict() preserves the load-bearing fields."""
    src = BookProfile(
        book_id="test-roundtrip",
        voice="narrator",
        genre="literary-fiction",
        detectors={"anaphora": DetectorConfig(warning_per_1k=3.0)},
    )
    d = src.to_dict()
    rt = BookProfile.from_dict(d)
    assert rt.book_id == "test-roundtrip"
    assert rt.voice == "narrator"
    assert rt.detectors["anaphora"].warning_per_1k == 3.0


# ─── Registry ──────────────────────────────────────────────────────────────


def test_registry_starts_empty():
    """Phase 1 ships an empty registry — legacy detectors are not yet
    routed through it. Phase 2+ detectors register via @register."""
    # Snapshot + restore so we don't wipe out detectors other test files
    # registered at import time (anti_ai_lexical, proselint, sonics).
    snap = _registry.snapshot()
    try:
        _registry.clear()
        assert _registry.count() == 0
        assert list(discover()) == []
    finally:
        _registry.restore(snap)


def test_register_decorator_records_entry():
    snap = _registry.snapshot()
    _registry.clear()

    @register(
        name="test_detector",
        tier="stdlib",
        family="literary_device",
        description="Test-only detector for the canary.",
    )
    def fake_detector(prose, *, config, doc=None, api_client=None):
        return []

    entry = get("test_detector")
    assert entry is not None
    assert entry.name == "test_detector"
    assert entry.tier == "stdlib"
    assert entry.family == "literary_device"
    assert entry.description == "Test-only detector for the canary."
    assert entry.default_routing == "local"  # local-first default per ADR-0007

    _registry.restore(snap)


def test_register_filtering_by_family_and_tier():
    snap = _registry.snapshot()
    _registry.clear()

    @register(name="d1", tier="stdlib", family="literary_device")
    def d1(prose, *, config, doc=None, api_client=None):
        return []

    @register(name="d2", tier="spacy", family="literary_device")
    def d2(prose, *, config, doc=None, api_client=None):
        return []

    @register(name="d3", tier="lexical", family="anti_ai")
    def d3(prose, *, config, doc=None, api_client=None):
        return []

    assert _registry.count() == 3

    devices = discover(family="literary_device")
    assert {e.name for e in devices} == {"d1", "d2"}

    spacy_only = discover(tier="spacy")
    assert {e.name for e in spacy_only} == {"d2"}

    anti_ai = discover(family="anti_ai")
    assert {e.name for e in anti_ai} == {"d3"}

    _registry.restore(snap)


def test_register_rejects_duplicate_names():
    import pytest as _pytest

    snap = _registry.snapshot()
    _registry.clear()

    @register(name="dupe", tier="stdlib", family="literary_device")
    def first(prose, *, config, doc=None, api_client=None):
        return []

    with _pytest.raises(ValueError, match="already registered"):

        @register(name="dupe", tier="stdlib", family="literary_device")
        def second(prose, *, config, doc=None, api_client=None):
            return []

    _registry.restore(snap)


# ─── Fixture file presence ─────────────────────────────────────────────────


def test_non_book_a_sample_exists(non_book_a_sample):
    assert non_book_a_sample.exists()
    text = non_book_a_sample.read_text(encoding="utf-8")
    assert len(text) > 100, "fixture chapter must have prose content"
    # Sanity: fixture A's prose has the deliberate anaphora pattern.
    assert "The light came in low" in text


def test_non_book_b_sample_exists(non_book_b_sample):
    assert non_book_b_sample.exists()
    text = non_book_b_sample.read_text(encoding="utf-8")
    assert len(text) > 100
    # Sanity: fixture B's prose has the deliberate copula-avoidance pattern.
    assert "serves as" in text
