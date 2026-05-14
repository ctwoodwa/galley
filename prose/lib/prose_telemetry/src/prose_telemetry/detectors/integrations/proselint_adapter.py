"""Proselint adapter.

Bridges proselint 0.16+ (BSD-3) into the galley/prose detector contract.
Findings emerge under `family='proselint'` with `rule_id='proselint:<check_path>'`
so the verdict layer can section them distinctly from native detectors.

Check families that overlap with existing handcount detectors are disabled
by default (`DEDUPED_FAMILIES`). Book profiles can override the disable set
via `DetectorConfig.extra['proselint']['disabled_families']`.

Implementation notes:

- proselint's CheckRegistry is a process-wide singleton. We initialize it
  once on first call (idempotent) by registering proselint's `__register__`
  tuple of built-in checks.
- proselint's config is a plain dict with a nested `checks` dict keyed by
  top-level family ('cliches', 'redundancy', etc.). We clone the DEFAULT
  config per-call and zero out disabled families.
- proselint emits `LintResult(check_result, pos)` where `check_result.span`
  is a 2-tuple of absolute char offsets in the source. We map that
  directly onto `Finding.span`.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from proselint.checks import __register__ as _PROSELINT_BUILTIN_CHECKS
from proselint.config import load_from
from proselint.registry import CheckRegistry
from proselint.tools import LintFile

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


# Families that overlap with existing handcount detectors. Disabled by
# default to satisfy the Phase 3 "no duplicate findings" gate.
DEDUPED_FAMILIES: frozenset[str] = frozenset(
    {
        "cliches",  # overlaps handcount.detect_cliches
        "redundancy",  # overlaps handcount.detect_redundant_phrases
        "weasel_words",  # overlaps handcount.detect_vague_quantifiers
        "hedging",  # overlaps handcount.detect_modal_density + vague_quantifiers
    }
)


# Synthetic source path; proselint's LintFile requires one, but inline
# content never touches the filesystem.
_INLINE_SOURCE = Path("inline.md")


# One-time CheckRegistry initialization. CheckRegistry is a process-wide
# singleton in proselint 0.16+.
_INIT_LOCK = threading.Lock()
_INITIALIZED = False
_DEFAULT_CONFIG: dict[str, Any] | None = None


def _ensure_initialized() -> None:
    global _INITIALIZED, _DEFAULT_CONFIG
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        registry = CheckRegistry()
        if len(registry.checks) == 0:
            registry.register_many(_PROSELINT_BUILTIN_CHECKS)
        _DEFAULT_CONFIG = load_from(None)
        _INITIALIZED = True


def _check_family(check_path: str) -> str:
    """Top-level family of a proselint check path.

    `cliches.misc.write_good` → `cliches`.
    """
    return check_path.split(".", 1)[0]


def _build_config(disabled_families: set[str] | frozenset[str]) -> dict[str, Any]:
    """Return a config dict with `disabled_families` zeroed out."""
    _ensure_initialized()
    assert _DEFAULT_CONFIG is not None  # mypy / asserter
    cfg = dict(_DEFAULT_CONFIG)
    cfg["checks"] = {
        family: enabled and family not in disabled_families
        for family, enabled in _DEFAULT_CONFIG["checks"].items()
    }
    return cfg


def available_families() -> list[str]:
    """Return all top-level proselint check families."""
    _ensure_initialized()
    assert _DEFAULT_CONFIG is not None
    return sorted(_DEFAULT_CONFIG["checks"].keys())


def lint(
    prose: str, *, disabled_families: set[str] | frozenset[str] | None = None
) -> list[Finding]:
    """Run proselint on `prose`; return Findings under family='proselint'.

    If `disabled_families` is None, the built-in `DEDUPED_FAMILIES` set is
    used. Pass an empty set to disable nothing (full proselint coverage).
    Pass a custom set to override completely.
    """
    if not (prose or "").strip():
        return []
    disabled = DEDUPED_FAMILIES if disabled_families is None else disabled_families
    config = _build_config(disabled)

    lint_file = LintFile(source=_INLINE_SOURCE, content=prose)
    results = lint_file.lint(config)

    findings: list[Finding] = []
    for r in results:
        cr = r.check_result
        span = cr.span if cr.span else None
        text = prose[span[0] : span[1]] if span else None
        family = _check_family(cr.check_path)
        findings.append(
            Finding(
                type=f"proselint:{cr.check_path}",
                confidence=0.9,
                rule_id=f"proselint:{cr.check_path}",
                span=span,
                text=text,
                extra={
                    "family": "proselint",
                    "proselint_check": cr.check_path,
                    "proselint_family": family,
                    "message": cr.message,
                    "replacements": cr.replacements,
                    "line": r.pos[0],
                    "col": r.pos[1],
                },
            )
        )
    return findings


# ─── Registry entry ────────────────────────────────────────────────────────


@register(
    name="proselint",
    tier="lexical",
    family="proselint",
    description=(
        "Proselint integrated lint pass (BSD-3); deduplicated against "
        "handcount cliché / redundancy / weasel-word / hedging detectors "
        "by default."
    ),
    metadata={"source_library": "proselint", "license": "BSD-3-Clause"},
)
def detect_proselint(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    """The registry-facing entry point. Honors DetectorConfig.enabled and
    DetectorConfig.extra['proselint']['disabled_families'] (optional).
    """
    if not config.enabled:
        return []
    extra = config.extra.get("proselint", {}) if config.extra else {}
    disabled = set(extra.get("disabled_families", DEDUPED_FAMILIES))
    findings = lint(prose, disabled_families=disabled)
    if config.min_confidence > 0.0:
        findings = [f for f in findings if f.confidence >= config.min_confidence]
    return findings
