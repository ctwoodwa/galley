"""Detector autodiscovery registry.

A central catalog of all detectors available to the prose pipeline. Each
detector registers itself via the `@register(...)` decorator at module
import time. The registry exposes:

- `register(...)` — decorator new detectors apply.
- `get(name)` — fetch one entry by name.
- `discover(family=, tier=)` — list entries, optionally filtered.
- `clear()` — reset (test-only).

This is the Phase 1 skeleton. The existing 38 stdlib detectors in
`prose_telemetry/handcount/` and the 4 spaCy detectors in
`prose_telemetry/spacy_detectors.py` are NOT re-routed through this
registry in Phase 1 — they still run via their own dispatch logic. The
registry exists so new detectors (Phase 2 anti-AI lexical pack, Phase 3
sonics, Phase 5 mid-complexity devices, etc.) can land cleanly without
touching the older modules. Migration of legacy detectors into the
registry happens incrementally as detectors are touched for other reasons.

Per ADR-0006 (OpenAPI cross-stack) + ADR-0007 (local-first commitments),
each entry carries routing metadata so hybrid local↔remote detectors can
declare themselves correctly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Protocol

from prose_telemetry._common.types import DetectorConfig, Finding


# ─── Detector signature ────────────────────────────────────────────────────


class DetectorFn(Protocol):
    """The callable shape every registered detector must satisfy.

    Detectors take prose text plus a `DetectorConfig` and return a list
    of `Finding` instances. Optional kwargs:

    - `doc`: a spaCy `Doc` for tier='spacy' detectors. The dispatcher
      provides this when tier='spacy'; ignore otherwise.
    - `api_client`: a remote-API client for tier='remote' or hybrid
      detectors. When None, hybrid detectors fall back to local mode
      with `Finding.extra['mode'] = 'local-fallback'` per ADR-0007.
    """

    def __call__(
        self,
        prose: str,
        *,
        config: DetectorConfig,
        doc: Any = None,
        api_client: Any = None,
    ) -> list[Finding]: ...


# ─── Registry entry ────────────────────────────────────────────────────────


@dataclass
class DetectorEntry:
    """One registry record. Immutable once registered."""

    name: str
    """Stable name. Convention: snake_case matching the canonical
    literary-devices catalog or anti-AI tells catalog entry."""

    fn: DetectorFn
    """The detector callable."""

    tier: str
    """One of: 'stdlib' | 'spacy' | 'remote' | 'lexical' | 'structural'."""

    family: str
    """One of: 'literary_device' | 'anti_ai' | 'aggregate' |
    'rhythm' | 'continuity' | 'voice'."""

    local_mode: str = "default"
    """Free-form tag for which local implementation is active when
    multiple are registered for the same `name`. Example: 'heuristic'
    (CPU pattern) vs. 'transformer' (local GPU)."""

    remote_mode: str | None = None
    """When the detector has a remote-API counterpart, its mode tag.
    None for pure-local detectors."""

    default_routing: str = "local"
    """One of the DetectorConfig.routing values. The book profile can
    override per-detector. Most detectors should be 'local'."""

    description: str = ""
    """One-line summary surfaced in `prose --list-detectors` and in
    dashboards. Defaults to the function's docstring first line."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Detector-specific metadata: catalog reference, ADR pointer,
    fixture path. Free-form."""


# ─── Module-level registry ─────────────────────────────────────────────────


_REGISTRY: dict[str, DetectorEntry] = {}


def register(
    name: str,
    *,
    tier: str = "stdlib",
    family: str = "literary_device",
    local_mode: str = "default",
    remote_mode: str | None = None,
    default_routing: str = "local",
    description: str = "",
    metadata: dict[str, Any] | None = None,
) -> Callable[[DetectorFn], DetectorFn]:
    """Decorator that registers a detector with the central registry.

    Example:

        @register("copula_avoidance", tier="lexical", family="anti_ai")
        def detect_copula_avoidance(prose, *, config, doc=None, api_client=None):
            ...
            return findings

    Raises ValueError if a detector with the same name is already
    registered. Use a distinct name (e.g. with a tier suffix) if you
    need both implementations active simultaneously.
    """

    def deco(fn: DetectorFn) -> DetectorFn:
        if name in _REGISTRY:
            raise ValueError(
                f"Detector '{name}' is already registered "
                f"(tier={_REGISTRY[name].tier}). Use a distinct name."
            )
        desc = description or _first_doc_line(fn)
        _REGISTRY[name] = DetectorEntry(
            name=name,
            fn=fn,
            tier=tier,
            family=family,
            local_mode=local_mode,
            remote_mode=remote_mode,
            default_routing=default_routing,
            description=desc,
            metadata=dict(metadata or {}),
        )
        return fn

    return deco


def get(name: str) -> DetectorEntry | None:
    """Return the entry for `name`, or None if not registered."""
    return _REGISTRY.get(name)


def discover(
    *,
    family: str | None = None,
    tier: str | None = None,
) -> list[DetectorEntry]:
    """Return all entries, optionally filtered by family and/or tier.

    Entries are returned in registration order (Python dict preserves
    insertion order). Callers that need a stable order should sort by
    `.name`.
    """
    out = list(_REGISTRY.values())
    if family is not None:
        out = [e for e in out if e.family == family]
    if tier is not None:
        out = [e for e in out if e.tier == tier]
    return out


def names() -> Iterator[str]:
    """Yield every registered detector name."""
    yield from _REGISTRY.keys()


def count() -> int:
    """How many detectors are currently registered."""
    return len(_REGISTRY)


def clear() -> None:
    """Reset the registry. Intended for tests."""
    _REGISTRY.clear()


def _first_doc_line(fn: DetectorFn) -> str:
    doc = (fn.__doc__ or "").strip()
    if not doc:
        return ""
    return doc.splitlines()[0]
