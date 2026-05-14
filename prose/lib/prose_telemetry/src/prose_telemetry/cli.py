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

    stdlib_result: dict = {}
    spacy_result: dict = {}

    if not args.no_stdlib:
        print(f"[stdlib] handcount on {chapter_path.name}...")
        handcount = _load_handcount(book_repo)
        stdlib_result = handcount.measure(chapter_path)

    if not args.no_spacy:
        print(f"[spacy]  loading model + analyzing...")
        from prose_telemetry import load_nlp, analyze_chapter
        nlp = load_nlp()
        spacy_result = analyze_chapter(nlp, chapter_path)

    if stdlib_result and spacy_result:
        merged = _merge(stdlib_result, spacy_result)
    elif stdlib_result:
        merged = stdlib_result
    elif spacy_result:
        merged = spacy_result
    else:
        sys.exit("Both --no-stdlib and --no-spacy specified; nothing to do.")

    # Determine output path.
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
    print()
    if roll.get("blockers"):
        print("BLOCKERS:")
        for b in roll["blockers"]:
            print(f"  ✗ {b}")
    if roll.get("warnings"):
        print("WARNINGS:")
        for w in roll["warnings"]:
            print(f"  ⚠ {w}")


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
    args = ap.parse_args()
    if args.cmd == "measure":
        cmd_measure(args)


if __name__ == "__main__":
    main()
