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

    @classmethod
    def from_book_root(
        cls,
        book_root: Path | str,
        *,
        yaml_filename: str = "book.editorial.yaml",
    ) -> "BookProfile":
        """Load `<book_root>/book.editorial.yaml` and apply the galley UI
        overlay sidecar at `<book_root>/.galley/editorial.json` if present.

        The yaml is the author-owned pipeline config (detector thresholds,
        held-lines, compute routing). The sidecar is the galley UI overlay
        (preset scales thresholds; active_voice overrides voice). When the
        yaml is absent, a minimal default profile is returned. When the
        sidecar is absent, the yaml is returned unmodified.

        See `apply_editorial_overlay` for overlay semantics.
        """
        root = Path(book_root)
        yaml_path = root / yaml_filename
        if yaml_path.exists():
            profile = cls.from_yaml(yaml_path)
        else:
            profile = cls(book_id=root.name)

        overlay_path = root / ".galley" / "editorial.json"
        if overlay_path.exists():
            try:
                import json
                with open(overlay_path, encoding="utf-8") as f:
                    overlay_doc = json.load(f) or {}
                prefs = overlay_doc.get("prefs") or {}
                if prefs:
                    profile = apply_editorial_overlay(profile, prefs)
            except (OSError, ValueError):
                # Malformed sidecar — fall back to yaml-only profile rather
                # than crashing the pipeline. The UI is the source of truth
                # for the sidecar and will overwrite next save.
                pass
        return profile

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


# ─── Editorial overlay (galley UI sidecar) ─────────────────────────────────

# Preset → threshold scaling factor. Multiplied into every detector's
# warning_per_1k / blocker_per_1k / warning_raw_count / blocker_raw_count
# when the field is non-None. Higher factor = higher threshold = fewer
# findings ("gentle"); lower factor = lower threshold = more findings
# ("strict"). Standard is identity so the yaml's tuned thresholds pass
# through unchanged.
PROSE_PRESET_FACTORS: dict[str, float] = {
    "gentle":   1.5,
    "standard": 1.0,
    "strict":   0.7,
}


def _scale_threshold(value: float | int | None, factor: float, *, integer: bool) -> float | int | None:
    """Multiply a threshold by `factor`, preserving None and integer kind."""
    if value is None:
        return None
    scaled = value * factor
    if integer:
        return max(1, int(round(scaled)))
    return scaled


def apply_editorial_overlay(profile: BookProfile, prefs: dict[str, Any]) -> BookProfile:
    """Return a new BookProfile with the galley UI sidecar applied.

    The sidecar carries three fields today (mirrors `EditorialPrefs` in
    apps/web/src/api/editorialPrefs.ts):

      - activeVoice: str   — when non-empty, replaces profile.voice.
      - prosePreset: str   — 'gentle' | 'standard' | 'strict'. Scales
                              every detector's warning/blocker thresholds
                              by the matching factor in PROSE_PRESET_FACTORS.
                              Unknown values are treated as 'standard'.
      - voicePassMode: str — UI/agent concern; preserved in profile.extra
                              under '_voice_pass_mode' for the voice-pass
                              agent to pick up. Ignored by detectors.

    Returns a fresh BookProfile instance — the input is not mutated. Empty
    or absent fields fall back to the underlying profile.
    """
    active_voice = prefs.get("activeVoice")
    preset = prefs.get("prosePreset")
    voice_pass_mode = prefs.get("voicePassMode")

    factor = PROSE_PRESET_FACTORS.get(preset, 1.0) if isinstance(preset, str) else 1.0

    if factor == 1.0:
        scaled_detectors = profile.detectors
    else:
        scaled_detectors = {}
        for name, cfg in profile.detectors.items():
            scaled_detectors[name] = DetectorConfig(
                enabled=cfg.enabled,
                warning_per_1k=_scale_threshold(cfg.warning_per_1k, factor, integer=False),
                blocker_per_1k=_scale_threshold(cfg.blocker_per_1k, factor, integer=False),
                warning_raw_count=_scale_threshold(cfg.warning_raw_count, factor, integer=True),
                blocker_raw_count=_scale_threshold(cfg.blocker_raw_count, factor, integer=True),
                min_confidence=cfg.min_confidence,
                stopwords=list(cfg.stopwords),
                motifs=dict(cfg.motifs),
                retired_motifs=list(cfg.retired_motifs),
                filter_words=list(cfg.filter_words),
                self_referential_frames=list(cfg.self_referential_frames),
                routing=cfg.routing,
                held_lines_path=cfg.held_lines_path,
                extra=dict(cfg.extra),
            )

    next_voice = profile.voice
    if isinstance(active_voice, str) and active_voice.strip():
        next_voice = active_voice.strip()

    next_extra = dict(profile.extra)
    if isinstance(voice_pass_mode, str) and voice_pass_mode:
        next_extra["_voice_pass_mode"] = voice_pass_mode
    if isinstance(preset, str) and preset:
        next_extra["_prose_preset"] = preset

    return BookProfile(
        book_id=profile.book_id,
        voice=next_voice,
        genre=profile.genre,
        detectors=scaled_detectors,
        compute=profile.compute,
        held_lines_dir=profile.held_lines_dir,
        extra=next_extra,
    )


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
