"""Third-party detector integrations for galley/prose.

Each module here wraps an external FOSS detector library and exposes it
via the galley/prose `Finding` contract. Currently:

- `proselint_adapter` — wraps proselint (BSD-3) with default dedup against
  handcount detectors.

Future:
- `freestylo_remote` (Phase 9, optional) — HTTP-isolated GPL Freestylo
  metaphor detector behind galley/apps/api/.
"""

from prose_telemetry.detectors.integrations import proselint_adapter  # noqa: F401

__all__ = ["proselint_adapter"]
