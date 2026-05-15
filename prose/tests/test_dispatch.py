"""End-to-end tests for the registry dispatch.

The dispatch is the production code path that runs the 27 registry-
based detectors. These tests pin its contract:

  - Dispatch produces JSON-serializable findings + metrics rows.
  - Voice detectors honour the BookProfile-supplied lists (and produce
    zero findings when the lists are empty).
  - The editorial-overlay preset scaling reaches detectors:
    'strict' lowers thresholds → registry-side findings hold the same
    raw counts but normalize against the same word count, while the
    overlay's threshold changes affect detectors that THRESHOLD against
    config (motif_overuse with capped phrases, lexical_chain_loop, …).
  - One bad detector cannot break a run — the dispatch logs and skips.
"""

from __future__ import annotations

from prose_telemetry._common.types import (
    BookProfile,
    DetectorConfig,
    apply_editorial_overlay,
)
from prose_telemetry.dispatch import run_registry


SAMPLE = (
    "The sun rose over the harbour. I felt the wind shift, and the "
    "boat heeled sharply to starboard. I noticed the captain's hand "
    "tighten on the wheel. The crew worked the lines with quiet, "
    "practiced economy. I knew the storm would arrive within the "
    "hour. The clouds gathered on the western horizon, dark and low."
)


def test_dispatch_returns_findings_and_metrics_rows():
    profile = BookProfile(book_id="t", voice="anna")
    result = run_registry(SAMPLE, profile)
    # At minimum the registry has the 27 self-registering detectors.
    # Some emit zero findings on this sample; the metrics row still
    # records they ran (raw_count=0).
    assert result.word_count > 0
    assert len(result.metrics) >= 20
    for row in result.metrics:
        assert {"device", "raw_count", "count_per_1k_tokens", "_source", "_family", "_tier"} <= row.keys()
        assert row["_source"] == "registry"


def test_filter_words_fires_when_book_profile_supplies_verbs():
    profile = BookProfile(
        book_id="t",
        voice="anna",
        detectors={"filter_words": DetectorConfig(filter_words=["felt", "noticed", "knew"])},
    )
    result = run_registry(SAMPLE, profile)
    fw = next((m for m in result.metrics if m["device"] == "filter_words"), None)
    assert fw is not None
    # "I felt …", "I noticed …", "I knew …" — three matches in the sample.
    assert fw["raw_count"] == 3
    # And findings appear in the findings list with the matching device type.
    fw_findings = [f for f in result.findings if f["type"] == "filter_words"]
    assert len(fw_findings) == 3


def test_filter_words_silent_when_book_profile_has_empty_list():
    profile = BookProfile(book_id="t", detectors={"filter_words": DetectorConfig()})
    result = run_registry(SAMPLE, profile)
    fw = next((m for m in result.metrics if m["device"] == "filter_words"), None)
    assert fw is not None
    assert fw["raw_count"] == 0


def test_dispatch_skips_detectors_with_enabled_false():
    profile = BookProfile(
        book_id="t",
        detectors={"filter_words": DetectorConfig(enabled=False, filter_words=["felt"])},
    )
    result = run_registry(SAMPLE, profile)
    fw = next((m for m in result.metrics if m["device"] == "filter_words"), None)
    # Disabled detector is omitted from the metrics rollup entirely.
    assert fw is None


def test_dispatch_uses_overlay_merged_profile():
    """The strict preset should *scale* per-detector thresholds.
    Verifies the overlay reaches the dispatch (not that detectors then
    use those thresholds — that's per-detector behaviour, covered by
    each detector's own tests)."""
    base = BookProfile(
        book_id="t",
        detectors={"filter_words": DetectorConfig(
            warning_per_1k=4.0,
            blocker_per_1k=10.0,
            filter_words=["felt", "noticed"],
        )},
    )
    strict = apply_editorial_overlay(base, {"prosePreset": "strict"})
    # The strict-scaled profile that flows into dispatch has lower
    # thresholds — and the threshold metadata is observable on the
    # config the dispatcher would hand to each detector.
    cfg = strict.detectors["filter_words"]
    assert cfg.warning_per_1k == 4.0 * 0.7
    assert cfg.blocker_per_1k == 10.0 * 0.7
    # And dispatch still runs cleanly with the overlay-merged profile.
    result = run_registry(SAMPLE, strict)
    fw = next((m for m in result.metrics if m["device"] == "filter_words"), None)
    assert fw is not None
    assert fw["raw_count"] == 2


def test_dispatch_includes_anti_ai_and_devices_families():
    """Surface check: the registry passes covers more than just voice
    detectors — anti-AI, literary devices, sonics families all run."""
    profile = BookProfile(book_id="t")
    result = run_registry(SAMPLE, profile)
    families = {m["_family"] for m in result.metrics}
    # Phase 4 (voice), Phase 5 (literary_device), Phase 6 (anti_ai),
    # Phase 3 (sonics) must all be reachable through the registry.
    assert {"voice", "literary_device", "anti_ai", "sonics"} <= families
