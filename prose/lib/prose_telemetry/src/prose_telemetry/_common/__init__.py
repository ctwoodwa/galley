"""Shared types and registry contracts for galley's prose tool family.

This subpackage is the canonical home for cross-cutting dataclasses
(Finding, DetectorConfig, BookProfile, Verdict) and the detector autodiscovery
registry. It lives inside `prose_telemetry` for now (Phase 1) and is imported
by sibling packages (story_canon, future narrative_continuity) via
`from prose_telemetry._common.types import Finding`.

If/when a third sibling editorial package emerges that wants these types
without depending on prose_telemetry, this subpackage promotes to its own
standalone package (`prose-common` or similar). The API is designed to make
that promotion mechanical: no upward dependencies on the rest of
prose_telemetry.
"""

from prose_telemetry._common.types import (
    PROSE_PRESET_FACTORS,
    BookProfile,
    ComputeConfig,
    DetectorConfig,
    Finding,
    Verdict,
    apply_editorial_overlay,
)
from prose_telemetry._common.registry import (
    DetectorEntry,
    discover,
    get,
    register,
    restore,
    snapshot,
)

__all__ = [
    "PROSE_PRESET_FACTORS",
    "BookProfile",
    "ComputeConfig",
    "DetectorConfig",
    "DetectorEntry",
    "Finding",
    "Verdict",
    "apply_editorial_overlay",
    "discover",
    "get",
    "register",
    "restore",
    "snapshot",
]
