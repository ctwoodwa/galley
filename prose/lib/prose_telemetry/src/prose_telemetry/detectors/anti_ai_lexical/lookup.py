"""Generic lexical-lookup detector.

`LexicalLookupDetector` loads a yaml file describing a pattern family
(name, description, marker regexes, confidence, severity hint) and
exposes a `.detect(prose, *, config, doc=None, api_client=None)` method
that matches the regexes against prose and emits `Finding` objects.

The same class handles all 10 anti-AI lexical detectors in this pack —
each is defined by its yaml file, not by a separate Python module.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


# ─── Yaml-defined pattern ──────────────────────────────────────────────────


@dataclass
class LookupPattern:
    """One yaml-defined detection pattern."""

    name: str
    """Stable detector name; becomes the registry key. Match the yaml
    filename (without extension) for clarity."""

    family: str = "anti_ai"
    description: str = ""

    markers: list[str] = field(default_factory=list)
    """Regex patterns. Findings are emitted for every non-overlapping
    match across all markers. Patterns are compiled with re.IGNORECASE."""

    confidence: float = 0.85

    severity: str = "warning"
    """Hint for the verdict layer: 'info' | 'warning' | 'blocker'.
    Defaults to warning — anti-AI tells are signals for human review,
    not auto-rejection."""

    default_routing: str = "local"
    why: str = ""
    examples_before: list[str] = field(default_factory=list)
    examples_after: list[str] = field(default_factory=list)


# ─── Detector instance ─────────────────────────────────────────────────────


class LexicalLookupDetector:
    """A regex-matching detector loaded from a yaml file."""

    def __init__(self, pattern: LookupPattern):
        self.pattern = pattern
        # Compile once; reuse across detect() calls.
        self._compiled = [
            re.compile(m, re.IGNORECASE) for m in pattern.markers
        ]

    @classmethod
    def from_yaml(cls, path: Path | str) -> "LexicalLookupDetector":
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return cls(LookupPattern(**{
            k: v for k, v in data.items()
            if k in {
                "name", "family", "description", "markers", "confidence",
                "severity", "default_routing", "why",
                "examples_before", "examples_after",
            }
        }))

    @property
    def name(self) -> str:
        return self.pattern.name

    def detect(
        self,
        prose: str,
        *,
        config: DetectorConfig,
        doc: Any = None,  # unused; lexical detectors don't need spaCy
        api_client: Any = None,  # unused; local-only
    ) -> list[Finding]:
        """Return one Finding per non-overlapping regex match.

        Honors `config.enabled` (no findings when disabled) and
        `config.min_confidence` (findings below threshold dropped).
        """
        if not config.enabled:
            return []
        if (prose or "").strip() == "":
            return []
        if self.pattern.confidence < config.min_confidence:
            return []

        findings: list[Finding] = []
        for regex in self._compiled:
            for m in regex.finditer(prose):
                findings.append(
                    Finding(
                        type=self.pattern.name,
                        confidence=self.pattern.confidence,
                        rule_id=f"lexical:{self.pattern.name}",
                        span=(m.start(), m.end()),
                        text=m.group(0),
                        extra={
                            "marker": regex.pattern,
                            "family": self.pattern.family,
                            "severity_hint": self.pattern.severity,
                        },
                    )
                )
        return findings


# ─── Auto-discovery helper ─────────────────────────────────────────────────


def load_all_from_dir(directory: Path | str) -> list[LexicalLookupDetector]:
    """Load every `*.yaml` file in `directory` as a LexicalLookupDetector
    and register each one with the central registry.

    Returns the list of detectors loaded (in filename-sorted order).
    Already-registered names are skipped silently — this is so re-import
    after a registry.clear() in tests doesn't crash.
    """
    directory = Path(directory)
    detectors: list[LexicalLookupDetector] = []

    for yaml_path in sorted(directory.glob("*.yaml")):
        # Skip schema files / non-pattern yaml.
        if yaml_path.name.startswith("_"):
            continue

        detector = LexicalLookupDetector.from_yaml(yaml_path)

        # Register the detect method. Use a closure so the detector
        # instance is captured.
        def _make_fn(d: LexicalLookupDetector):
            def _fn(
                prose: str,
                *,
                config: DetectorConfig,
                doc: Any = None,
                api_client: Any = None,
            ) -> list[Finding]:
                return d.detect(prose, config=config, doc=doc, api_client=api_client)
            _fn.__doc__ = d.pattern.description
            return _fn

        try:
            register(
                name=detector.name,
                tier="lexical",
                family=detector.pattern.family,
                default_routing=detector.pattern.default_routing,
                description=(detector.pattern.description.split("\n")[0]).strip(),
                metadata={
                    "yaml_source": str(yaml_path),
                    "severity_hint": detector.pattern.severity,
                    "marker_count": len(detector.pattern.markers),
                },
            )(_make_fn(detector))
        except ValueError:
            # Already registered — fine for re-imports.
            pass

        detectors.append(detector)

    return detectors
