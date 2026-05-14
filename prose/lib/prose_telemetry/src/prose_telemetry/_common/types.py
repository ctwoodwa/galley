"""Core dataclasses for galley/prose.

Five shared types codify the contracts every detector + meter + verdict
layer agrees on:

- Finding: one detection event from one detector.
- DetectorConfig: per-detector knobs (thresholds, stopwords, routing).
- ComputeConfig: per-book compute routing — local CPU, local GPU, or
  user-controlled remote endpoint (ADR-0007 local-first commitments).
- BookProfile: full per-book configuration loaded from book.editorial.yaml.
- Verdict: chapter-level rollup (red/yellow/green + blocker/warning lists).

All five are intentionally Python-dataclass-shaped (not Pydantic, not
attrs) to keep the dependency surface narrow. yaml ↔ dataclass conversion
is via plain dict round-tripping; book yaml is hand-validated against
books/_schema.yaml by the loader.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any


# ─── Detection event ───────────────────────────────────────────────────────


@dataclass
class Finding:
    """One detection event emitted by one detector.

    Maps cleanly to the existing prose-metrics.json `detected_devices[]`
    schema. `confidence` is the detector's self-reported certainty (the
    verdict layer can downgrade or filter by confidence). `rule_id`
    namespaces the source ("stdlib:detect_anaphora", "spacy:isocolon",
    "remote:metaphor"), so multiple implementations of the same device
    can be distinguished.
    """

    type: str
    """Device name from the canonical literary-devices catalog or anti-AI
    tells catalog. Example: 'anaphora', 'copula_avoidance', 'isocolon'."""

    confidence: float
    """0.0 – 1.0. The verdict layer's per-detector threshold combines this
    with frequency/density to decide severity."""

    rule_id: str
    """Provenance: '<tier>:<implementation-name>'. Tier is one of
    'stdlib', 'spacy', 'remote', 'lexical'."""

    span: tuple[int, int] | None = None
    """(start_char, end_char) of the source markdown if applicable. Some
    detectors (document-level aggregates) emit findings with no span."""

    text: str | None = None
    """Verbatim matched text, if applicable. For multi-sentence
    detections, the surrounding excerpt."""

    extra: dict[str, Any] = field(default_factory=dict)
    """Detector-specific fields not in the canonical schema (run_length,
    prefix, lemma_pair, paragraph_id, etc.). Survives JSON serialization."""

    def to_dict(self) -> dict[str, Any]:
        out = {
            "type": self.type,
            "confidence": self.confidence,
            "rule_id": self.rule_id,
        }
        if self.span is not None:
            out["start_char"], out["end_char"] = self.span
        if self.text is not None:
            out["text"] = self.text
        out.update(self.extra)
        return out


# ─── Per-detector config ───────────────────────────────────────────────────


@dataclass
class DetectorConfig:
    """Knobs a book profile can override for any detector.

    All fields are optional. When a detector reads its config and a field
    is None, the detector applies its built-in default. This lets the
    galley-shipped defaults work out-of-the-box while still allowing
    per-book tuning for the Anna-calibrated detectors (motif_overuse,
    self_referential_frame, filter_words, lexical_chain, etc.).

    `routing` is the local-first ADR-0007 commitment: detectors that
    have both a local-only and a remote-GPU implementation honor this
    choice. Pure-local detectors ignore it.
    """

    enabled: bool = True

    # Density-based threshold knobs (per-1000 tokens normalization).
    warning_per_1k: float | None = None
    blocker_per_1k: float | None = None

    # Raw-count threshold knobs (used for absolute-count rules like cliché,
    # inference_cascade, confirmation_tag).
    warning_raw_count: int | None = None
    blocker_raw_count: int | None = None

    # Per-detector confidence floor — findings below this are dropped.
    min_confidence: float = 0.0

    # Anna-style calibration knobs lifted from handcount hardcoded lists.
    # Each detector consults the subset relevant to it.
    stopwords: list[str] = field(default_factory=list)
    motifs: dict[str, int] = field(default_factory=dict)  # motif → cap
    retired_motifs: list[str] = field(default_factory=list)
    filter_words: list[str] = field(default_factory=list)
    self_referential_frames: list[str] = field(default_factory=list)

    # Routing for hybrid local↔remote detectors (ADR-0006 + ADR-0007).
    routing: str = "local"
    """One of: 'local' | 'remote' | 'prefer_local' | 'prefer_remote'."""

    # Held-lines mechanism — author-approved exemptions.
    held_lines_path: str | None = None

    # Detector-specific knobs not yet promoted to first-class fields.
    extra: dict[str, Any] = field(default_factory=dict)


# ─── Compute routing (ADR-0007) ────────────────────────────────────────────


@dataclass
class ComputeConfig:
    """Where prose detectors run — local CPU/GPU vs. user-controlled remote.

    Per ADR-0007 (Sunfish local-first commitments): 'remote' always means
    a server the user owns. The user supplies the URL and credentials.
    No defaults phone home anywhere; default mode is fully local.
    """

    cpu_workers: int = 4
    """Local CPU parallelism for detectors that can shard across cores."""

    gpu_mode: str = "auto"
    """One of: 'auto' | 'local' | 'remote' | 'none'.
    - auto: prefer local GPU if present, fall back to remote if configured,
      fall back to CPU heuristics otherwise.
    - local: require local GPU; error if absent.
    - remote: require remote endpoint; error if unreachable.
    - none: never use GPU; CPU-only operation."""

    gpu_local_device: str | None = None
    """Device specifier when gpu_mode is 'local' or 'auto' with GPU
    present. Example: 'cuda:0', 'mps:0' (Apple Silicon)."""

    remote_base_url: str | None = None
    """URL of the user-controlled remote galley API server. None means
    no remote backend; pipeline is fully local."""

    remote_auth_token_env: str = "GALLEY_API_TOKEN"
    """Name of the environment variable holding the Bearer token. Never
    embedded in the yaml or in source. Per ADR-0007, credentials are
    user-owned."""

    remote_timeout_seconds: int = 30
    """How long to wait for a remote detector call before falling back
    to local-mode degradation."""

    cache_dir: str = "~/.galley/cache/prose"
    """Per-chapter-hash result cache. Resolved with `os.path.expanduser`."""

    def expanded_cache_dir(self) -> Path:
        return Path(os.path.expanduser(self.cache_dir))

    def remote_auth_token(self) -> str | None:
        """Read the auth token from the configured env var, or None."""
        return os.environ.get(self.remote_auth_token_env)


# ─── Per-book profile ──────────────────────────────────────────────────────


@dataclass
class BookProfile:
    """Full per-book configuration loaded from a book.editorial.yaml.

    A book profile carries:
      - voice / genre identity (informational; future use for voice-
        fingerprint comparison)
      - per-detector configuration overrides
      - compute routing config
      - pointer to the book's held-lines mechanism

    Loaded with BookProfile.from_yaml(path) or BookProfile.from_dict(d).
    Round-trips losslessly to dict for serialization. Schema-validated
    by editorial/books/_schema.yaml (Phase 1+).
    """

    book_id: str
    """Stable identifier. Convention: directory-friendly slug matching
    the book repo name. Example: 'the-inverted-stack'."""

    voice: str | None = None
    """Narrator-voice identity. Example: 'anna'. None = generic narrator."""

    genre: str = "literary-fiction"
    """Broad genre tag. Informational only in Phase 1; future use for
    selecting genre-aware threshold profiles."""

    detectors: dict[str, DetectorConfig] = field(default_factory=dict)
    """Per-detector overrides keyed by detector name (e.g.
    'lexical_chain_loop', 'copula_avoidance'). Detectors not mentioned
    here use their built-in defaults."""

    compute: ComputeConfig = field(default_factory=ComputeConfig)
    """How and where this book wants prose detectors to run."""

    held_lines_dir: str | None = None
    """Path (relative to the book repo root) where this book's held-lines
    exemption files live. Example: 'vol-2/act-1/' would resolve
    ch02-recruitment-interview.held-lines.json next to the chapter."""

    extra: dict[str, Any] = field(default_factory=dict)
    """Fields not yet promoted to first-class. Preserved across
    round-trips."""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BookProfile":
        compute_data = data.get("compute", {}) or {}
        compute = ComputeConfig(**compute_data) if compute_data else ComputeConfig()

        detectors_data = data.get("detectors", {}) or {}
        detectors = {
            name: DetectorConfig(**(cfg or {})) for name, cfg in detectors_data.items()
        }

        known = {
            "book_id", "voice", "genre", "detectors", "compute", "held_lines_dir",
        }
        extras = {k: v for k, v in data.items() if k not in known}

        return cls(
            book_id=data["book_id"],
            voice=data.get("voice"),
            genre=data.get("genre", "literary-fiction"),
            detectors=detectors,
            compute=compute,
            held_lines_dir=data.get("held_lines_dir"),
            extra=extras,
        )

    @classmethod
    def from_yaml(cls, path: Path | str) -> "BookProfile":
        import yaml
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return cls.from_dict(data)

    def detector(self, name: str) -> DetectorConfig:
        """Return the config for `name`, or a fresh default if unset."""
        return self.detectors.get(name, DetectorConfig())

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "book_id": self.book_id,
            "genre": self.genre,
        }
        if self.voice:
            out["voice"] = self.voice
        if self.held_lines_dir:
            out["held_lines_dir"] = self.held_lines_dir
        if self.detectors:
            out["detectors"] = {
                name: {k: v for k, v in asdict(cfg).items() if v not in (None, [], {}, False, 0.0, 0)}
                for name, cfg in self.detectors.items()
            }
        out["compute"] = asdict(self.compute)
        out.update(self.extra)
        return out


# ─── Verdict rollup ────────────────────────────────────────────────────────


@dataclass
class Verdict:
    """Chapter-level rollup. Three-state — red / yellow / green — with
    explanatory lists for each.

    `passes` is informational: detectors that ran but didn't flag. The
    web reader / dashboard renders them in a separate section so the user
    can confirm the pipeline scanned what they expected.
    """

    verdict: str
    """'red' | 'yellow' | 'green'."""

    blockers: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    passes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "blockers": list(self.blockers),
            "warnings": list(self.warnings),
            "passes": list(self.passes),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Verdict":
        return cls(
            verdict=data["verdict"],
            blockers=list(data.get("blockers", [])),
            warnings=list(data.get("warnings", [])),
            passes=list(data.get("passes", [])),
        )
