"""Registry-based detector dispatch for production prose measurement.

Closes the gap where 27 `@register(...)` detectors lived as unit-test-
only code paths. This module iterates `discover()` and runs each
registered detector against a chapter's prose, threading the chapter's
`BookProfile` (yaml + galley UI overlay) through so per-detector config
— and the editorial-UI's preset scaling — actually affects findings.

Designed to run *alongside* the existing handcount + spaCy pipelines
(see `cli.py`), not to replace them. The handcount script in the book
repo continues to own the stdlib detectors that pre-date the registry;
this dispatch only runs the registered ones.

Each detector function follows the uniform contract:

    def detect_foo(
        prose: str,
        *,
        config: DetectorConfig,
        doc: spacy.tokens.Doc | None = None,
        api_client: object | None = None,
    ) -> list[Finding]

Detectors that need a parsed spaCy doc receive one if available; the
dispatch builds it lazily and shares it across detectors to avoid
double-parsing. Detectors that error out are logged and skipped — one
bad detector cannot break a measurement run.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

# Importing the detectors package triggers @register on every detector
# module. After this line, `discover()` returns the production set.
import prose_telemetry.detectors  # noqa: F401  side-effect: registration
from prose_telemetry._common.registry import discover
from prose_telemetry._common.types import BookProfile, DetectorConfig, Finding


logger = logging.getLogger(__name__)

# Word-count proxy used to compute count_per_1k_tokens density metrics.
# Cheap regex tokenization is good enough for the rollup layer — the
# handcount script uses a richer counter for its own metrics and the
# spaCy pipeline normalizes against doc.text. Keeping a separate cheap
# count here means dispatch doesn't depend on either of those.
_WORD_RE = re.compile(r"\b[\w'-]+\b")


def _count_words(prose: str) -> int:
    return len(_WORD_RE.findall(prose))


@dataclass
class DispatchResult:
    """Output of one registry pass over a chapter.

    Shape parallels the handcount pipeline so the CLI can merge cleanly:
      - `findings`: detector outputs as JSON-serializable dicts (the
        same shape handcount emits under `detected_devices`).
      - `metrics`: per-detector rollup (`device`, `raw_count`,
        `count_per_1k_tokens`). `held_count` and
        `sentence_coverage_pct` are zero — held-lines reconciliation
        and sentence coverage are handcount-layer concerns.
      - `word_count`: the tokenization the metrics were normalized
        against. Useful for downstream sanity checks.
    """

    findings: list[dict[str, Any]]
    metrics: list[dict[str, Any]]
    word_count: int


def run_registry(
    prose: str,
    profile: BookProfile,
    *,
    doc: Any | None = None,
    api_client: Any | None = None,
) -> DispatchResult:
    """Run every registered detector against `prose` using `profile` for
    per-detector config.

    The caller controls which detectors fire by what's in
    `profile.detectors` (an unset detector falls back to a default-
    constructed `DetectorConfig`, which means `enabled=True` and every
    threshold `None` — detectors that need explicit thresholds skip
    themselves in that case).

    `doc` is an optional shared spaCy doc — pass one when the caller
    already built it for the spaCy-tier pipeline so we don't re-parse.
    """
    findings: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    word_count = _count_words(prose) or 1

    for entry in discover():
        cfg: DetectorConfig = profile.detectors.get(entry.name) or DetectorConfig()
        if not cfg.enabled:
            continue
        try:
            results = entry.fn(prose, config=cfg, doc=doc, api_client=api_client)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[dispatch] detector %r raised %s: %s; skipping",
                entry.name, type(exc).__name__, exc,
            )
            continue

        raw_count = len(results)
        for f in results:
            findings.append(f.to_dict() if isinstance(f, Finding) else dict(f))

        metrics.append({
            "device": entry.name,
            "raw_count": raw_count,
            "held_count": 0,
            "count_per_1k_tokens": round(raw_count * 1000 / word_count, 3),
            "sentence_coverage_pct": 0.0,
            "_source": "registry",
            "_family": entry.family,
            "_tier": entry.tier,
        })

    return DispatchResult(findings=findings, metrics=metrics, word_count=word_count)
