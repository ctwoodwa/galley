"""Verdict rollup for the registry pipeline.

Translates per-detector metrics + the `BookProfile`'s per-detector
thresholds (already overlay-merged by `BookProfile.from_book_root`,
so the galley UI's preset scaling is baked in) into a single
`Verdict` — red/yellow/green plus blocker/warning/pass lists.

Threshold model (matches `DetectorConfig`):

  - blocker_per_1k, warning_per_1k    — density-based thresholds; the
    metric's `count_per_1k_tokens` is compared against them. Set to
    `None` to disable the density check.
  - blocker_raw_count, warning_raw_count — absolute-count thresholds;
    the metric's `raw_count` is compared. `None` disables.

If both density and raw-count thresholds are set, density wins. If
neither is set the detector is informational — it lands in `passes`
without an opinion.

Editorial-overlay scaling is a property of the input profile, not
of this layer. Strict preset → thresholds 0.7×; gentle → 1.5×; the
verdict layer just compares numbers it's given.
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.types import BookProfile, DetectorConfig, Verdict


def rollup_registry(
    metrics: list[dict[str, Any]],
    profile: BookProfile,
) -> Verdict:
    """Classify each registry metric against the profile's configured
    thresholds. Returns a verdict the CLI can attach under
    `registry_pipeline.verdict` and that the dashboard can render."""
    blockers: list[str] = []
    warnings: list[str] = []
    passes: list[str] = []

    for metric in metrics:
        name: str = metric["device"]
        cfg: DetectorConfig | None = profile.detectors.get(name)

        # No config entry → informational. Most galley-shipped detectors
        # don't define thresholds in the yaml; they're surfaced as-is
        # for the dashboard's discretion.
        if cfg is None:
            passes.append(name)
            continue

        raw: int = metric.get("raw_count", 0)
        per_1k: float = metric.get("count_per_1k_tokens", 0.0)

        classified = _classify(name, raw, per_1k, cfg)
        if classified[0] == "blocker":
            blockers.append(classified[1])
        elif classified[0] == "warning":
            warnings.append(classified[1])
        else:
            passes.append(name)

    if blockers:
        verdict_str = "red"
    elif warnings:
        verdict_str = "yellow"
    else:
        verdict_str = "green"

    return Verdict(
        verdict=verdict_str,
        blockers=blockers,
        warnings=warnings,
        passes=passes,
    )


def _classify(
    name: str,
    raw: int,
    per_1k: float,
    cfg: DetectorConfig,
) -> tuple[str, str]:
    """Return (severity, message). severity ∈ {'blocker','warning','pass'}.

    Density thresholds are exclusive when set — if either
    `warning_per_1k` or `blocker_per_1k` is configured, the detector
    is judged by density and raw counts are ignored. That's because
    the editorial overlay scales density thresholds; mixing in raw
    checks would silently bypass the preset.

    Raw-count thresholds apply only when density is fully unset.
    """
    density_active = cfg.warning_per_1k is not None or cfg.blocker_per_1k is not None
    if density_active:
        if cfg.blocker_per_1k is not None and per_1k >= cfg.blocker_per_1k:
            return ("blocker",
                    f"{name}: {per_1k:.2f}/1k ≥ blocker {cfg.blocker_per_1k:.2f}")
        if cfg.warning_per_1k is not None and per_1k >= cfg.warning_per_1k:
            return ("warning",
                    f"{name}: {per_1k:.2f}/1k ≥ warning {cfg.warning_per_1k:.2f}")
        return ("pass", name)

    if cfg.blocker_raw_count is not None and raw >= cfg.blocker_raw_count:
        return ("blocker",
                f"{name}: {raw} ≥ blocker {cfg.blocker_raw_count}")
    if cfg.warning_raw_count is not None and raw >= cfg.warning_raw_count:
        return ("warning",
                f"{name}: {raw} ≥ warning {cfg.warning_raw_count}")
    return ("pass", name)
