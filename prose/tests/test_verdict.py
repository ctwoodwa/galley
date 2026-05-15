"""Tests for the registry-pipeline verdict rollup.

The rollup is where preset-scaled thresholds in `BookProfile` become
consequential — a "strict" preset shrinks thresholds, which means
more findings cross from `passes` into `warnings` / `blockers`. These
tests pin the threshold semantics so future overlay or detector
changes can't silently change the verdict shape.
"""

from __future__ import annotations

from prose_telemetry._common.types import (
    BookProfile,
    DetectorConfig,
    apply_editorial_overlay,
)
from prose_telemetry.verdict import rollup_registry


def _metric(name: str, raw: int, per_1k: float) -> dict:
    return {
        "device": name,
        "raw_count": raw,
        "held_count": 0,
        "count_per_1k_tokens": per_1k,
        "sentence_coverage_pct": 0.0,
        "_source": "registry",
        "_family": "test",
        "_tier": "stdlib",
    }


def test_green_when_no_metric_crosses_thresholds():
    profile = BookProfile(book_id="t", detectors={
        "filter_words": DetectorConfig(warning_per_1k=4.0, blocker_per_1k=10.0),
    })
    metrics = [_metric("filter_words", raw=1, per_1k=0.5)]

    verdict = rollup_registry(metrics, profile)

    assert verdict.verdict == "green"
    assert verdict.blockers == []
    assert verdict.warnings == []
    assert verdict.passes == ["filter_words"]


def test_yellow_when_density_warning_threshold_crossed():
    profile = BookProfile(book_id="t", detectors={
        "filter_words": DetectorConfig(warning_per_1k=4.0, blocker_per_1k=10.0),
    })
    metrics = [_metric("filter_words", raw=5, per_1k=5.0)]

    verdict = rollup_registry(metrics, profile)

    assert verdict.verdict == "yellow"
    assert len(verdict.warnings) == 1
    assert "filter_words" in verdict.warnings[0]
    assert "warning 4.00" in verdict.warnings[0]
    assert verdict.blockers == []


def test_red_when_density_blocker_threshold_crossed():
    profile = BookProfile(book_id="t", detectors={
        "filter_words": DetectorConfig(warning_per_1k=4.0, blocker_per_1k=10.0),
    })
    metrics = [_metric("filter_words", raw=12, per_1k=12.0)]

    verdict = rollup_registry(metrics, profile)

    assert verdict.verdict == "red"
    assert len(verdict.blockers) == 1
    assert "blocker 10.00" in verdict.blockers[0]


def test_raw_count_thresholds_apply_when_density_unset():
    profile = BookProfile(book_id="t", detectors={
        "rare_thing": DetectorConfig(warning_raw_count=3, blocker_raw_count=5),
    })
    metrics_warn = [_metric("rare_thing", raw=4, per_1k=0.0)]
    metrics_block = [_metric("rare_thing", raw=6, per_1k=0.0)]

    assert rollup_registry(metrics_warn, profile).verdict == "yellow"
    assert rollup_registry(metrics_block, profile).verdict == "red"


def test_density_wins_when_both_thresholds_set():
    """A detector that defines both density and raw thresholds is
    evaluated by density first — density is the unit the editorial
    overlay scales, so it's the source of truth for preset
    interpretation."""
    profile = BookProfile(book_id="t", detectors={
        "x": DetectorConfig(
            warning_per_1k=4.0,
            blocker_per_1k=10.0,
            warning_raw_count=1,
            blocker_raw_count=2,
        ),
    })
    metrics = [_metric("x", raw=100, per_1k=2.0)]

    verdict = rollup_registry(metrics, profile)
    # Density says pass; raw says blocker. Density wins.
    assert verdict.verdict == "green"
    assert verdict.passes == ["x"]


def test_detectors_without_config_are_informational():
    """Most galley-shipped detectors don't define thresholds — they're
    surfaced for the dashboard's discretion, not the verdict layer."""
    profile = BookProfile(book_id="t")  # no detectors configured
    metrics = [
        _metric("alliteration", raw=20, per_1k=4.0),
        _metric("antimetabole", raw=85, per_1k=16.5),
    ]

    verdict = rollup_registry(metrics, profile)

    assert verdict.verdict == "green"
    assert set(verdict.passes) == {"alliteration", "antimetabole"}


def test_strict_preset_can_promote_pass_to_warning():
    """The whole point of the overlay loop: tighter preset → tighter
    thresholds → metrics that previously passed start warning."""
    base = BookProfile(book_id="t", detectors={
        "filter_words": DetectorConfig(warning_per_1k=5.0, blocker_per_1k=12.0),
    })
    strict = apply_editorial_overlay(base, {"prosePreset": "strict"})
    # strict factor 0.7 → warning threshold 5.0 × 0.7 = 3.5
    metrics = [_metric("filter_words", raw=4, per_1k=4.0)]

    assert rollup_registry(metrics, base).verdict == "green"
    assert rollup_registry(metrics, strict).verdict == "yellow"


def test_gentle_preset_can_demote_warning_to_pass():
    base = BookProfile(book_id="t", detectors={
        "filter_words": DetectorConfig(warning_per_1k=3.0, blocker_per_1k=10.0),
    })
    gentle = apply_editorial_overlay(base, {"prosePreset": "gentle"})
    # gentle factor 1.5 → warning threshold 3.0 × 1.5 = 4.5
    metrics = [_metric("filter_words", raw=4, per_1k=4.0)]

    assert rollup_registry(metrics, base).verdict == "yellow"
    assert rollup_registry(metrics, gentle).verdict == "green"


def test_multiple_detectors_combine_into_one_verdict():
    profile = BookProfile(book_id="t", detectors={
        "a": DetectorConfig(warning_per_1k=2.0, blocker_per_1k=5.0),
        "b": DetectorConfig(warning_per_1k=2.0, blocker_per_1k=5.0),
        "c": DetectorConfig(warning_per_1k=2.0, blocker_per_1k=5.0),
    })
    metrics = [
        _metric("a", raw=1, per_1k=1.0),   # pass
        _metric("b", raw=3, per_1k=3.0),   # warning
        _metric("c", raw=6, per_1k=6.0),   # blocker
    ]

    verdict = rollup_registry(metrics, profile)

    assert verdict.verdict == "red"
    assert len(verdict.blockers) == 1
    assert len(verdict.warnings) == 1
    assert verdict.passes == ["a"]
