"""Tests for the mid-complexity device detector pack (Phase 5).

One positive + one negative test per detector plus the standard
empty-input / disabled-config canaries. Inline fixtures keep each test
self-documenting.
"""

from __future__ import annotations

import prose_telemetry.detectors.devices  # noqa: F401  auto-registers all 9
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


# The Phase 5/6 mid-complexity device pack — pinned by name + catalog
# id. Detectors added in later phases (Phase 8 batch 1 added the
# classical-rhetoric pack: anaphora / asyndeton / polysyndeton /
# literal_tricolon) also register as family='literary_device',
# tier='stdlib' but live in different sub-packages and don't carry the
# literary-devices catalog ID, so the assertions below scope to this
# specific pack.
PHASE_5_6_DEVICES = {
    "antimetabole",
    "climax",
    "concession",
    "definition_by_negation",
    "distinctio",
    "epistrophe",
    "erotema",
    "hypophora",
    "litotes",
    "prolepsis",
    "simile",
    "symploce",
}


# ─── Registration ──────────────────────────────────────────────────────────


def test_phase_5_6_devices_register():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    # Subset, not equality — later phases (8+) add stdlib literary_device
    # detectors in other sub-packages.
    assert PHASE_5_6_DEVICES <= names


def test_each_phase_5_6_device_carries_catalog_id():
    for name in PHASE_5_6_DEVICES:
        entry = get(name)
        assert entry is not None
        assert "catalog_id" in entry.metadata


# ─── epistrophe ────────────────────────────────────────────────────────────


def test_epistrophe_fires_on_repeated_tail():
    text = (
        "When the network fails, your app fails. "
        "When the vendor fails, your app fails. "
        "When the bill comes due, your app fails."
    )
    findings = get("epistrophe").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["run_length"] == 3
    assert findings[0].extra["tail"] == "app fails"


def test_epistrophe_quiet_on_varied_endings():
    text = "Each chapter opens. Each chapter closes differently. Each chapter teaches."
    findings = get("epistrophe").fn(text, config=DetectorConfig())
    assert findings == []


# ─── symploce ──────────────────────────────────────────────────────────────


def test_symploce_fires_on_head_and_tail_match():
    text = (
        "In Zone A, you own the data. "
        "In Zone B, you own the data. "
        "In Zone C, you own the data."
    )
    findings = get("symploce").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["head"] == "in zone"
    assert findings[0].extra["tail"] == "the data"


def test_symploce_quiet_when_only_head_matches():
    text = "In Zone A there is one thing. In Zone B there is another. In Zone C there is a third."
    findings = get("symploce").fn(text, config=DetectorConfig())
    # Heads match ("in zone"), tails don't ("thing"/"another"/"third").
    assert findings == []


# ─── antimetabole ──────────────────────────────────────────────────────────


def test_antimetabole_fires_on_word_reversal():
    text = (
        "We stopped asking what the cloud could do for our data, and "
        "started asking what our data could do without the cloud."
    )
    findings = get("antimetabole").fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    pair = {findings[0].extra["word_a"], findings[0].extra["word_b"]}
    assert pair == {"cloud", "data"}


def test_antimetabole_quiet_on_linear_repetition():
    text = "The cloud carries the cloud and the cloud holds the cloud."
    findings = get("antimetabole").fn(text, config=DetectorConfig())
    # Same word repeated four times is not antimetabole (needs a pair).
    assert findings == []


# ─── erotema ───────────────────────────────────────────────────────────────


def test_erotema_fires_on_unanswered_question():
    text = "Who would design it this way? The system simply works."
    # The next sentence doesn't end with period... wait it does. So this
    # would be hypophora. Use a real unanswered case:
    text = "Who would design it this way?\n\nThe rest of the chapter continues."
    findings = get("erotema").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_erotema_quiet_on_dialogue_question():
    text = '"Are you ready?" she asked.'
    findings = get("erotema").fn(text, config=DetectorConfig())
    assert findings == []


# ─── hypophora ─────────────────────────────────────────────────────────────


def test_hypophora_fires_on_question_plus_answer():
    text = "What does sovereignty cost? It costs an engineering month and saves a vendor decade."
    findings = get("hypophora").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert "sovereignty" in findings[0].extra["question"]


def test_hypophora_quiet_on_dialogue():
    text = '"What time is it?" he asked. "Late," she said.'
    findings = get("hypophora").fn(text, config=DetectorConfig())
    assert findings == []


# ─── prolepsis ─────────────────────────────────────────────────────────────


def test_prolepsis_fires_on_objection_plus_reply():
    text = (
        "You might think this is a step backwards into client-server. "
        "It is not. Client-server placed authority in the server."
    )
    findings = get("prolepsis").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert "you might think" in findings[0].extra["objection_phrase"].lower()


def test_prolepsis_quiet_without_reply():
    text = "You might think this is rare. Many factors contribute to its frequency."
    findings = get("prolepsis").fn(text, config=DetectorConfig())
    assert findings == []


# ─── concession ────────────────────────────────────────────────────────────


def test_concession_fires_on_yes_pivot():
    text = "Yes, X is true — and that is precisely why Y matters."
    findings = get("concession").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_concession_fires_with_however_pivot():
    text = "Granted, the cost is real, however the savings exceed it within a year."
    findings = get("concession").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_concession_quiet_without_pivot():
    text = "Yes, the cost is real and predictable."
    findings = get("concession").fn(text, config=DetectorConfig())
    assert findings == []


# ─── distinctio ────────────────────────────────────────────────────────────


def test_distinctio_fires_on_quoted_definition():
    text = 'By "local-first" we mean a system where the device holds the authoritative copy.'
    findings = get("distinctio").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_distinctio_fires_on_when_i_say_form():
    text = "When I say 'sovereignty' I mean the user can extract their data without permission."
    findings = get("distinctio").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_distinctio_quiet_on_plain_definition():
    text = "Local-first is a system architecture pattern."
    findings = get("distinctio").fn(text, config=DetectorConfig())
    # No explicit "by 'X' we mean" framing.
    assert findings == []


# ─── definition_by_negation ────────────────────────────────────────────────


def test_definition_by_negation_fires_on_negation_run():
    text = (
        "Local-first is not offline-only. It is not peer-to-peer. "
        "It is the architecture in which the device holds the authoritative copy."
    )
    findings = get("definition_by_negation").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["negation_run_length"] >= 2
    assert findings[0].extra["has_affirming_close"] is True


def test_definition_by_negation_quiet_on_single_negation():
    text = "It is not the case that the network is reliable. Trust the device instead."
    findings = get("definition_by_negation").fn(text, config=DetectorConfig())
    # Only one negation; need 2+ consecutive.
    assert findings == []


# ─── simile (Phase 6 extra) ────────────────────────────────────────────────


def test_simile_fires_on_like_a_pattern():
    text = "Sync without conflict resolution is like a version control system without merging."
    findings = get("simile").fn(text, config=DetectorConfig())
    assert len(findings) >= 1


def test_simile_fires_on_as_adj_as_pattern():
    text = "The migration was as smooth as a glass surface."
    findings = get("simile").fn(text, config=DetectorConfig())
    assert len(findings) >= 1


def test_simile_quiet_on_no_comparison():
    text = "The migration was smooth and complete."
    findings = get("simile").fn(text, config=DetectorConfig())
    assert findings == []


# ─── litotes (Phase 6 extra) ───────────────────────────────────────────────


def test_litotes_fires_on_not_un_x():
    text = "The cost of running your own infrastructure is not unreasonable."
    findings = get("litotes").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_litotes_fires_on_no_small_feat():
    text = "Shipping the migration was no small feat for the engineering team."
    findings = get("litotes").fn(text, config=DetectorConfig())
    assert len(findings) == 1


def test_litotes_quiet_on_plain_negative():
    text = "The cost is not zero, but it is not enormous either."
    findings = get("litotes").fn(text, config=DetectorConfig())
    # 'not zero' / 'not enormous' don't match the canonical not-un-X pattern.
    assert findings == []


# ─── climax (Phase 6 extra) ────────────────────────────────────────────────


def test_climax_fires_on_ascending_list():
    text = (
        "You lose the dashboard, you lose the integrations, and you "
        "lose the customers who relied on the data for their decisions."
    )
    findings = get("climax").fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    counts = findings[0].extra["word_counts"]
    assert counts[0] <= counts[1] <= counts[2]


def test_climax_quiet_on_uniform_lengths():
    text = "Sync is observable, replayable, and recoverable."
    findings = get("climax").fn(text, config=DetectorConfig())
    # Items: 'observable'=1, 'replayable'=1, 'recoverable'=1. Ratio 1.0
    # below min 1.5 — should not fire.
    assert findings == []


def test_climax_quiet_on_descending_list():
    text = (
        "You lose the customers who built their workflows around the "
        "data, you lose integrations, and you lose access."
    )
    findings = get("climax").fn(text, config=DetectorConfig())
    # Not monotonically non-decreasing.
    assert findings == []


# ─── Empty input + disabled config ─────────────────────────────────────────


def test_devices_safe_on_empty_input():
    for name in PHASE_5_6_DEVICES:
        entry = get(name)
        assert entry.fn("", config=DetectorConfig()) == []
        assert entry.fn("   \n\n  ", config=DetectorConfig()) == []


def test_devices_disabled_config_returns_empty():
    text = (
        "By 'local-first' we mean a system where the device holds. "
        "Yes, that costs — and that is precisely why it matters."
    )
    for name in PHASE_5_6_DEVICES:
        entry = get(name)
        findings = entry.fn(text, config=DetectorConfig(enabled=False))
        assert findings == []
