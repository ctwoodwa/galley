"""Tests for the proselint adapter (galley/prose Phase 3)."""

from __future__ import annotations

import pytest

from prose_telemetry._common import get
from prose_telemetry._common.types import DetectorConfig

# Importing the package auto-registers `proselint` with the central registry.
import prose_telemetry.detectors.integrations  # noqa: F401
from prose_telemetry.detectors.integrations.proselint_adapter import (
    DEDUPED_FAMILIES,
    available_families,
    lint,
)


def _proselint_detector():
    """Helper — proselint detector entry from the central registry."""
    entry = get("proselint")
    assert entry is not None, "proselint detector should register on import"
    return entry


# ─── Registration + metadata ───────────────────────────────────────────────


def test_proselint_registers_as_lexical_family_proselint():
    entry = _proselint_detector()
    assert entry.tier == "lexical"
    assert entry.family == "proselint"
    assert entry.description.startswith("Proselint")


def test_proselint_metadata_records_license():
    entry = _proselint_detector()
    assert entry.metadata.get("license") == "BSD-3-Clause"


# ─── Dedup defaults ────────────────────────────────────────────────────────


def test_default_disabled_families_covers_handcount_overlap():
    """Sanity: the families we dedup against actually exist in proselint."""
    available = set(available_families())
    for fam in DEDUPED_FAMILIES:
        assert fam in available, f"{fam} not in proselint's family list"


def test_cliches_suppressed_by_default():
    """The default config disables cliches; classic clichés produce 0 findings."""
    text = "He showed a willingness to fall by the wayside and hit a home run."
    findings = lint(text)
    assert all(f.extra["proselint_family"] != "cliches" for f in findings)


def test_cliches_visible_when_dedup_disabled():
    """Override: enable all proselint families; clichés should fire."""
    text = "He showed a willingness to fall by the wayside and hit a home run."
    findings = lint(text, disabled_families=set())
    cliches = [f for f in findings if f.extra["proselint_family"] == "cliches"]
    assert len(cliches) >= 1


def test_net_new_families_fire_through_detector():
    """A non-deduped family (nonwords / redundancy.ras_syndrome) fires under
    the registry-facing detect_proselint with default config."""
    text = "Please withdraw cash from the ATM machine. Irregardless of fees."
    entry = _proselint_detector()
    findings = entry.fn(text, config=DetectorConfig())
    # ATM machine and 'irregardless' are not in the deduped families
    # (they're under 'redundancy.ras_syndrome' and 'nonwords' — wait,
    # ras_syndrome IS under 'redundancy' which IS deduped. Let me only
    # assert on 'nonwords'.)
    families_seen = {f.extra["proselint_family"] for f in findings}
    assert "nonwords" in families_seen
    # 'cliches', 'redundancy', 'weasel_words', 'hedging' should not appear
    assert families_seen.isdisjoint(DEDUPED_FAMILIES)


# ─── Finding shape ─────────────────────────────────────────────────────────


def test_finding_shape_matches_contract():
    # 'irregardless' is in proselint.nonwords (not deduped by default).
    text = "Irregardless of the rules, he persisted."
    findings = lint(text)
    assert findings, "expected at least one finding"
    f = findings[0]
    assert f.type.startswith("proselint:")
    assert f.rule_id == f.type
    assert f.span is not None
    assert f.confidence == 0.9
    assert f.extra["family"] == "proselint"
    assert f.extra["proselint_check"]
    assert f.extra["proselint_family"]
    assert f.extra["message"]
    assert "line" in f.extra
    assert "col" in f.extra


def test_finding_text_matches_span():
    text = "Irregardless of cost, he went forward today."
    findings = lint(text)
    for f in findings:
        if f.span is None:
            continue
        # The text slice should match what proselint flagged.
        assert text[f.span[0] : f.span[1]] == f.text


# ─── Edge cases ────────────────────────────────────────────────────────────


def test_empty_prose_returns_no_findings():
    assert lint("") == []
    assert lint("   \n\n  ") == []


def test_disabled_config_returns_no_findings():
    text = "Please withdraw cash from the ATM machine."
    entry = _proselint_detector()
    findings = entry.fn(text, config=DetectorConfig(enabled=False))
    assert findings == []


def test_book_profile_can_override_disabled_families():
    """A book.editorial.yaml can supply its own disabled_families list."""
    text = "He showed a willingness to fall by the wayside."
    cfg = DetectorConfig(extra={"proselint": {"disabled_families": []}})
    entry = _proselint_detector()
    findings = entry.fn(text, config=cfg)
    # With everything enabled, the cliche fires.
    assert any(f.extra["proselint_family"] == "cliches" for f in findings)
