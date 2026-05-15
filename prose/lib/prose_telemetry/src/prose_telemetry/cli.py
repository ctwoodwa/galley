"""Unified prose-telemetry CLI — runs stdlib + spaCy detectors and writes
one merged prose-metrics.json artifact per chapter.

Usage:
    prose-telemetry measure <chapter.md>
    prose-telemetry measure <chapter.md> --out /custom/path/metrics.json
    prose-telemetry measure <chapter.md> --no-spacy   # stdlib only
    prose-telemetry measure <chapter.md> --no-stdlib  # spacy only

The handcount stdlib module is imported from the book repo's `build/`
directory; pass --book-repo to override the auto-detected path.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

# Default book-repo path. Override via --book-repo or BOOK_REPO env var.
DEFAULT_BOOK_REPO = Path("/Users/christopherwood/Projects/SunfishSoftware/the-inverted-stack")


def _find_book_repo(chapter_path: Path, override: Path | None) -> Path:
    """Locate the book repo root by walking up from the chapter path.
    Override wins if provided."""
    if override is not None:
        return override
    p = chapter_path.resolve()
    for ancestor in [p] + list(p.parents):
        if (ancestor / "build" / "prose_telemetry_handcount.py").exists():
            return ancestor
    return DEFAULT_BOOK_REPO


def _read_chapter_prose(chapter_path: Path) -> str:
    """Strip markdown chrome from a chapter file for registry detectors.
    Mirrors `spacy_detectors._strip_to_prose` but available without
    requiring spaCy to be loaded."""
    from prose_telemetry.spacy_detectors import _strip_to_prose
    return _strip_to_prose(chapter_path.read_text(encoding="utf-8"))


def _load_handcount(book_repo: Path):
    """Dynamically import the stdlib handcount module from the book repo."""
    script_path = book_repo / "build" / "prose_telemetry_handcount.py"
    if not script_path.exists():
        sys.exit(f"Stdlib handcount script not found at {script_path}")
    spec = importlib.util.spec_from_file_location(
        "prose_telemetry_handcount", str(script_path)
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _merge(stdlib_result: dict[str, Any], spacy_result: dict[str, Any]) -> dict[str, Any]:
    """Merge spaCy findings into the stdlib result. The stdlib result is
    the canonical schema; spaCy findings extend the detected_devices and
    metrics arrays."""
    merged = dict(stdlib_result)
    merged["detected_devices"] = list(stdlib_result.get("detected_devices", []))
    merged["metrics"] = list(stdlib_result.get("metrics", []))
    # Append spaCy findings.
    merged["detected_devices"].extend(spacy_result.get("detected_devices", []))
    # Append spaCy metrics with the same per-device shape as stdlib.
    for met in spacy_result.get("metrics", []):
        merged["metrics"].append({
            "device": met["device"],
            "raw_count": met.get("raw_count", 0),
            "held_count": 0,
            "count_per_1k_tokens": met.get("count_per_1k_tokens", 0),
            "sentence_coverage_pct": 0,
        })
    # Annotate that both tiers ran.
    merged["_pipeline"] = {
        "stdlib_handcount": True,
        "spacy_tier": True,
        "spacy_model": spacy_result.get("spacy_model"),
        "spacy_version": spacy_result.get("spacy_version"),
    }
    merged["_schema_status"] = (
        "phase-2-unified — stdlib (39 detectors) + spaCy-tier (4 detectors) merged"
    )

    # Re-run the rollup with spaCy findings considered. Verdict rules for
    # spaCy detectors are appended below.
    rollup = merged.get("rollup", {})
    warnings = list(rollup.get("warnings", []))
    blockers = list(rollup.get("blockers", []))
    passes = list(rollup.get("passes", []))

    word_count = merged.get("document_metrics", {}).get("word_count", 1) or 1
    by_dev = {m["device"]: m for m in merged["metrics"]}

    if "isocolon" in by_dev:
        n = by_dev["isocolon"]["raw_count"]
        if n >= 3:
            warnings.append(f"isocolon: {n} POS-parallel sentence run(s) — review for intentional vs. looping")
        elif n >= 1:
            passes.append("isocolon")
        else:
            passes.append("isocolon")
    if "distributed_chiasmus" in by_dev:
        n = by_dev["distributed_chiasmus"]["raw_count"]
        if n >= 5:
            warnings.append(f"distributed_chiasmus: {n} ABBA reversal patterns (often signal of motif over-use)")
        else:
            passes.append("distributed_chiasmus")
    if "nominalization" in by_dev:
        n = by_dev["nominalization"]["raw_count"]
        per_1k = n * 1000 / word_count
        if per_1k > 20:
            warnings.append(f"nominalization: {per_1k:.1f}/1k POS-verified abstract nouns (academic register)")
        else:
            passes.append("nominalization")
    if "antithesis_within_sentence" in by_dev:
        n = by_dev["antithesis_within_sentence"]["raw_count"]
        per_1k = n * 1000 / word_count
        if per_1k > 3:
            warnings.append(f"antithesis_within_sentence: {per_1k:.1f}/1k within-sentence antitheses")
        else:
            passes.append("antithesis_within_sentence")

    # Re-derive verdict from updated blockers/warnings.
    if blockers:
        verdict = "red"
    elif warnings:
        verdict = "yellow"
    else:
        verdict = "green"
    merged["rollup"] = {
        "verdict": verdict,
        "blockers": blockers,
        "warnings": warnings,
        "passes": passes,
    }
    return merged


def cmd_measure(args) -> None:
    chapter_path = args.chapter.resolve()
    if not chapter_path.exists():
        sys.exit(f"Chapter not found: {chapter_path}")

    book_repo = _find_book_repo(chapter_path, args.book_repo)

    # Per-book editorial profile — book.editorial.yaml overlaid by the
    # galley UI sidecar at <book_repo>/.galley/editorial.json. Drives
    # the registry pass; handcount + spaCy ignore it for now.
    from prose_telemetry._common.types import BookProfile, apply_editorial_overlay
    profile = BookProfile.from_book_root(book_repo)

    # --preset-override is a one-shot scaling override (used by galley's
    # in-panel preset switcher). It overlays after the sidecar so the
    # user's panel choice wins for this run, without persisting.
    preset_override = getattr(args, "preset_override", None)
    if preset_override:
        profile = apply_editorial_overlay(profile, {"prosePreset": preset_override})

    stdlib_result: dict = {}
    spacy_result: dict = {}
    registry_result = None

    # Status prints go to stderr when --stdout is set so they don't
    # corrupt the JSON payload an AI agent / script is consuming.
    status_stream = sys.stderr if args.stdout else sys.stdout
    def _status(msg: str) -> None:
        print(msg, file=status_stream)

    if not args.no_stdlib:
        _status(f"[stdlib] handcount on {chapter_path.name}...")
        handcount = _load_handcount(book_repo)
        stdlib_result = handcount.measure(chapter_path)

    spacy_doc = None
    if not args.no_spacy:
        _status(f"[spacy]  loading model + analyzing...")
        from prose_telemetry import load_nlp, analyze_chapter
        nlp = load_nlp()
        spacy_result = analyze_chapter(nlp, chapter_path)
        # Build a fresh doc on the chapter's plain-text body so the
        # registry pass can share it without re-parsing.
        try:
            from prose_telemetry.spacy_detectors import _strip_to_prose
            md_text = chapter_path.read_text(encoding="utf-8")
            spacy_doc = nlp(_strip_to_prose(md_text))
        except Exception:
            spacy_doc = None

    if not args.no_registry:
        _status(f"[registry] running {profile.book_id} profile "
                f"(preset={profile.extra.get('_prose_preset', 'standard')})...")
        from prose_telemetry.dispatch import run_registry
        # Registry detectors take plain prose; reuse handcount's text
        # extraction when available, else strip markdown ourselves.
        prose_text = stdlib_result.get("_prose_text") or _read_chapter_prose(chapter_path)
        registry_result = run_registry(prose_text, profile, doc=spacy_doc)

    if stdlib_result and spacy_result:
        merged = _merge(stdlib_result, spacy_result)
    elif stdlib_result:
        merged = stdlib_result
    elif spacy_result:
        merged = spacy_result
    else:
        if registry_result is None:
            sys.exit("All pipelines disabled; nothing to do.")
        merged = {"document_metrics": {"word_count": registry_result.word_count},
                  "detected_devices": [], "metrics": []}

    # Attach the registry pass under its own top-level key. Existing
    # downstream consumers of `detected_devices` / `metrics` keep their
    # current behaviour; tooling that wants the registry view reads
    # `registry_pipeline`.
    if registry_result is not None:
        from prose_telemetry.verdict import rollup_registry
        reg_verdict = rollup_registry(registry_result.metrics, profile)
        merged["registry_pipeline"] = {
            "book_id": profile.book_id,
            "preset": profile.extra.get("_prose_preset", "standard"),
            "active_voice": profile.voice,
            "voice_pass_mode": profile.extra.get("_voice_pass_mode"),
            "findings": registry_result.findings,
            "metrics": registry_result.metrics,
            "word_count": registry_result.word_count,
            "verdict": reg_verdict.to_dict(),
        }

    # Output: stdout for AI-agent / scripting use, file otherwise.
    if args.stdout:
        sys.stdout.write(json.dumps(merged, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.stdout.flush()
        return

    if args.out:
        out_path = args.out
    else:
        default_out = Path(
            "/Users/christopherwood/Projects/SunfishSoftware/galley/build/the-inverted-stack/output/qa"
        ) / f"{chapter_path.stem}.prose-metrics.json"
        out_path = default_out

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    print(f"Merged metrics: {out_path}")
    roll = merged.get("rollup", {})
    doc = merged.get("document_metrics", {})
    print(f"  verdict: {roll.get('verdict', '?')}  "
          f"warnings: {len(roll.get('warnings', []))}  "
          f"blockers: {len(roll.get('blockers', []))}")
    print(f"  words: {doc.get('word_count', 0):,}  "
          f"sentences: {doc.get('sentence_count', 0)}  "
          f"paragraphs: {doc.get('paragraph_count', 0)}")
    print(f"  detectors: {len(merged.get('metrics', []))}")
    print(f"  findings:  {len(merged.get('detected_devices', []))}")
    pipeline = merged.get("_pipeline", {})
    if pipeline.get("spacy_tier"):
        print(f"  spaCy:     {pipeline.get('spacy_model')} ({pipeline.get('spacy_version')})")
    reg = merged.get("registry_pipeline")
    if reg:
        rv = reg.get("verdict", {})
        print(f"  registry:  {len(reg['metrics'])} detectors, "
              f"{len(reg['findings'])} findings ({reg['preset']} preset)")
        print(f"             verdict={rv.get('verdict', '?')}  "
              f"blockers={len(rv.get('blockers', []))}  "
              f"warnings={len(rv.get('warnings', []))}")
        for b in rv.get("blockers", []):
            print(f"               ✗ {b}")
        for w in rv.get("warnings", []):
            print(f"               ⚠ {w}")
    print()
    if roll.get("blockers"):
        print("BLOCKERS:")
        for b in roll["blockers"]:
            print(f"  ✗ {b}")
    if roll.get("warnings"):
        print("WARNINGS:")
        for w in roll["warnings"]:
            print(f"  ⚠ {w}")


def cmd_init(args) -> None:
    """Scaffold `<book_root>/book.editorial.yaml` for a new book."""
    from prose_telemetry.init import init_book_editorial

    result = init_book_editorial(
        args.book_root,
        book_id=args.book_id,
        voice=args.voice,
        genre=args.genre,
        force=args.force,
    )
    if result.wrote:
        print(f"Wrote {result.path}")
    else:
        sys.exit(f"Skipped {result.path}: {result.skipped_reason}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="prose-telemetry")
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("measure", help="Run unified stdlib + spaCy detectors on a chapter")
    m.add_argument("chapter", type=Path, help="Path to the chapter markdown file")
    m.add_argument("--out", type=Path, default=None,
                   help="Output JSON path (default: galley/.../qa/{stem}.prose-metrics.json)")
    m.add_argument("--book-repo", type=Path, default=None,
                   help="Override book-repo root (auto-detected from chapter path)")
    m.add_argument("--no-spacy", action="store_true",
                   help="Skip spaCy-tier detectors (stdlib only)")
    m.add_argument("--no-stdlib", action="store_true",
                   help="Skip stdlib detectors (spaCy only)")
    m.add_argument("--no-registry", action="store_true",
                   help="Skip the registry-based detector pass")
    m.add_argument("--stdout", action="store_true",
                   help="Write the full metrics JSON to stdout (suppresses "
                        "summary text). For AI-agent / scripting use.")
    m.add_argument("--preset-override", choices=["gentle", "standard", "strict"],
                   default=None,
                   help="One-shot override for the book's prosePreset. Applied "
                        "via editorial overlay; does not mutate book.editorial.yaml.")

    init = sub.add_parser("init", help="Scaffold book.editorial.yaml for a new book")
    init.add_argument("book_root", type=Path,
                      help="Path to the book repo root (directory).")
    init.add_argument("--book-id", default=None,
                      help="Book identifier (default: directory name).")
    init.add_argument("--voice", default=None,
                      help="Narrator voice id (default: null).")
    init.add_argument("--genre", default="literary-fiction",
                      help="Genre tag (default: literary-fiction).")
    init.add_argument("--force", action="store_true",
                      help="Overwrite existing book.editorial.yaml.")

    args = ap.parse_args()
    if args.cmd == "measure":
        cmd_measure(args)
    elif args.cmd == "init":
        cmd_init(args)


if __name__ == "__main__":
    main()
