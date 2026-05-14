"""Tests for the editorial-overlay merge (galley UI sidecar → BookProfile).

The galley settings UI writes a `.galley/editorial.json` overlay next to
the author-owned `book.editorial.yaml`. The pipeline merges them at load
time: yaml is the baseline; the sidecar applies a preset scaling factor
to detector thresholds and (optionally) overrides the narrator voice.

These tests pin the overlay semantics so future changes to the UI shape
don't silently drift away from what the pipeline expects.
"""

from __future__ import annotations

import json

from prose_telemetry._common.types import (
    PROSE_PRESET_FACTORS,
    BookProfile,
    ComputeConfig,
    DetectorConfig,
    apply_editorial_overlay,
)


def _sample_profile() -> BookProfile:
    """A profile with mixed threshold kinds — density floats and raw-count
    ints — across two detectors so scaling is observable on both."""
    return BookProfile(
        book_id="test-book",
        voice="anna",
        detectors={
            "filter_words": DetectorConfig(
                warning_per_1k=4.0,
                blocker_per_1k=10.0,
                filter_words=["felt", "noticed"],
            ),
            "inference_cascade": DetectorConfig(
                warning_raw_count=3,
                blocker_raw_count=8,
            ),
        },
    )


# ─── apply_editorial_overlay — preset scaling ─────────────────────────────


def test_standard_preset_is_identity():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"prosePreset": "standard"})

    assert result.detectors["filter_words"].warning_per_1k == 4.0
    assert result.detectors["filter_words"].blocker_per_1k == 10.0
    assert result.detectors["inference_cascade"].warning_raw_count == 3
    assert result.detectors["inference_cascade"].blocker_raw_count == 8


def test_strict_preset_lowers_density_thresholds():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"prosePreset": "strict"})

    factor = PROSE_PRESET_FACTORS["strict"]
    assert result.detectors["filter_words"].warning_per_1k == 4.0 * factor
    assert result.detectors["filter_words"].blocker_per_1k == 10.0 * factor


def test_gentle_preset_raises_thresholds():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"prosePreset": "gentle"})

    factor = PROSE_PRESET_FACTORS["gentle"]
    assert result.detectors["filter_words"].warning_per_1k == 4.0 * factor
    assert result.detectors["filter_words"].blocker_per_1k == 10.0 * factor


def test_strict_preset_rounds_raw_counts_to_at_least_one():
    profile = BookProfile(
        book_id="b",
        detectors={
            "tiny": DetectorConfig(warning_raw_count=1, blocker_raw_count=2),
        },
    )
    result = apply_editorial_overlay(profile, {"prosePreset": "strict"})
    # 1 * 0.7 = 0.7, rounds to 1 (the floor).
    assert result.detectors["tiny"].warning_raw_count == 1
    # 2 * 0.7 = 1.4, rounds to 1.
    assert result.detectors["tiny"].blocker_raw_count == 1


def test_unknown_preset_treated_as_standard():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"prosePreset": "chaotic"})
    assert result.detectors["filter_words"].warning_per_1k == 4.0


def test_none_thresholds_stay_none_under_scaling():
    profile = BookProfile(
        book_id="b",
        detectors={
            "permissive": DetectorConfig(),  # all thresholds None
        },
    )
    result = apply_editorial_overlay(profile, {"prosePreset": "strict"})
    cfg = result.detectors["permissive"]
    assert cfg.warning_per_1k is None
    assert cfg.blocker_per_1k is None
    assert cfg.warning_raw_count is None
    assert cfg.blocker_raw_count is None


# ─── apply_editorial_overlay — voice + voice-pass-mode ────────────────────


def test_active_voice_overrides_profile_voice():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"activeVoice": "briar"})
    assert result.voice == "briar"


def test_empty_active_voice_does_not_override():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"activeVoice": "  "})
    assert result.voice == "anna"


def test_voice_pass_mode_lands_in_extra_for_agent_pickup():
    profile = _sample_profile()
    result = apply_editorial_overlay(
        profile,
        {"prosePreset": "standard", "voicePassMode": "auto-apply"},
    )
    assert result.extra.get("_voice_pass_mode") == "auto-apply"
    assert result.extra.get("_prose_preset") == "standard"


def test_overlay_does_not_mutate_input_profile():
    profile = _sample_profile()
    original_threshold = profile.detectors["filter_words"].warning_per_1k
    original_voice = profile.voice

    apply_editorial_overlay(profile, {"activeVoice": "briar", "prosePreset": "strict"})

    assert profile.detectors["filter_words"].warning_per_1k == original_threshold
    assert profile.voice == original_voice
    assert "_voice_pass_mode" not in profile.extra


def test_detector_specific_fields_preserved_through_scaling():
    profile = _sample_profile()
    result = apply_editorial_overlay(profile, {"prosePreset": "strict"})

    # filter_words list must survive the scaling rewrite.
    assert result.detectors["filter_words"].filter_words == ["felt", "noticed"]


# ─── BookProfile.from_book_root — yaml + sidecar integration ──────────────


def test_from_book_root_applies_sidecar_overlay(tmp_path):
    book_root = tmp_path / "my-book"
    book_root.mkdir()
    (book_root / "book.editorial.yaml").write_text(
        "book_id: my-book\n"
        "voice: anna\n"
        "detectors:\n"
        "  filter_words:\n"
        "    warning_per_1k: 4.0\n"
        "    blocker_per_1k: 10.0\n",
        encoding="utf-8",
    )
    galley_dir = book_root / ".galley"
    galley_dir.mkdir()
    (galley_dir / "editorial.json").write_text(
        json.dumps({
            "schema_version": 1,
            "updated_at": "2026-05-14T20:00:00Z",
            "prefs": {
                "activeVoice": "briar",
                "prosePreset": "strict",
                "voicePassMode": "read-only",
            },
        }),
        encoding="utf-8",
    )

    profile = BookProfile.from_book_root(book_root)

    assert profile.voice == "briar"
    factor = PROSE_PRESET_FACTORS["strict"]
    assert profile.detectors["filter_words"].warning_per_1k == 4.0 * factor
    assert profile.extra.get("_voice_pass_mode") == "read-only"


def test_from_book_root_without_sidecar_returns_yaml_unchanged(tmp_path):
    book_root = tmp_path / "yaml-only"
    book_root.mkdir()
    (book_root / "book.editorial.yaml").write_text(
        "book_id: yaml-only\nvoice: anna\n",
        encoding="utf-8",
    )

    profile = BookProfile.from_book_root(book_root)

    assert profile.voice == "anna"
    assert "_voice_pass_mode" not in profile.extra


def test_from_book_root_without_yaml_returns_minimal_profile(tmp_path):
    book_root = tmp_path / "fresh-book"
    book_root.mkdir()

    profile = BookProfile.from_book_root(book_root)

    assert profile.book_id == "fresh-book"
    assert profile.voice is None
    assert profile.detectors == {}


def test_from_book_root_handles_malformed_sidecar(tmp_path):
    book_root = tmp_path / "broken"
    book_root.mkdir()
    (book_root / "book.editorial.yaml").write_text(
        "book_id: broken\nvoice: anna\n", encoding="utf-8"
    )
    galley_dir = book_root / ".galley"
    galley_dir.mkdir()
    (galley_dir / "editorial.json").write_text("{not valid json", encoding="utf-8")

    # Malformed sidecar must not crash the pipeline — yaml wins.
    profile = BookProfile.from_book_root(book_root)
    assert profile.voice == "anna"


def test_from_book_root_respects_compute_config_from_yaml(tmp_path):
    """The sidecar must not stomp on yaml's compute config (which is
    operator-owned, not UI-owned)."""
    book_root = tmp_path / "compute"
    book_root.mkdir()
    (book_root / "book.editorial.yaml").write_text(
        "book_id: compute\n"
        "voice: anna\n"
        "compute:\n"
        "  cpu_workers: 8\n"
        "  gpu_mode: local\n",
        encoding="utf-8",
    )
    galley_dir = book_root / ".galley"
    galley_dir.mkdir()
    (galley_dir / "editorial.json").write_text(
        json.dumps({"prefs": {"activeVoice": "briar", "prosePreset": "gentle", "voicePassMode": "off"}}),
        encoding="utf-8",
    )

    profile = BookProfile.from_book_root(book_root)
    assert profile.compute.cpu_workers == 8
    assert profile.compute.gpu_mode == "local"
