"""story-canon CLI.

Usage:
    story-canon validate <chapter.md> --canon <canon.yaml>
    story-canon validate <chapter.md>   # auto-detects canon
    story-canon extract <chapter.md>     # show all extracted facts (no validation)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from story_canon import validate_chapter, load_canon
from story_canon.extractors import (
    extract_dates,
    extract_durations,
    extract_ages,
    extract_relationships,
)


def _auto_detect_canon(chapter_path: Path) -> Path | None:
    """Walk up the directory tree looking for a canon.yaml in a
    _series/, _bookshelf/, or chapter's containing volume."""
    for ancestor in chapter_path.resolve().parents:
        for candidate in ("_series/canon.yaml", "canon.yaml", "_bookshelf/canon.yaml"):
            p = ancestor / candidate
            if p.exists():
                return p
    return None


def cmd_validate(args) -> None:
    chapter_path = args.chapter.resolve()
    canon_path = args.canon
    if canon_path is None:
        canon_path = _auto_detect_canon(chapter_path)
        if canon_path is None:
            sys.exit(
                "No --canon path given and none auto-detected. Looked for "
                "_series/canon.yaml, canon.yaml, _bookshelf/canon.yaml in "
                "ancestor directories of the chapter."
            )

    report = validate_chapter(chapter_path, canon_path)
    if args.json:
        print(json.dumps(report, indent=2, default=str))
        return

    print(f"CHAPTER: {chapter_path}")
    print(f"CANON:   {canon_path}")
    print()
    summary = report["summary"]
    print(f"VERDICT: {summary['verdict']}  "
          f"blockers={summary['blockers']}  "
          f"warnings={summary['warnings']}  "
          f"info={summary['info']}")
    print()

    extracted = report["extracted"]
    print(f"EXTRACTED FACTS:")
    print(f"  dates:         {len(extracted['dates'])}")
    print(f"  durations:     {len(extracted['durations'])}")
    print(f"  ages:          {len(extracted['ages'])}")
    print(f"  relationships: {len(extracted['relationships'])}")
    print()

    if not report["issues"]:
        print("(no issues)")
        return

    for issue in report["issues"]:
        sev = issue.get("severity", "info").upper()
        marker = {"BLOCKER": "✗", "WARNING": "⚠", "INFO": "ℹ"}.get(sev, "•")
        print(f"  {marker} [{sev}] {issue.get('type')}")
        print(f"      {issue.get('message', '')}")
        for k in ("date_in_prose", "duration_in_prose", "claimed_days",
                  "computed_days", "chapter_date", "ref_date",
                  "canon_age", "character"):
            if k in issue:
                print(f"      {k}: {issue[k]}")
        print()


def cmd_extract(args) -> None:
    chapter_path = args.chapter.resolve()
    prose = chapter_path.read_text(encoding="utf-8")
    import re
    prose = re.sub(r"<!--.*?-->", "", prose, flags=re.DOTALL)

    result = {
        "chapter": str(chapter_path),
        "dates": extract_dates(prose),
        "durations": extract_durations(prose),
        "ages": extract_ages(prose),
        "relationships": extract_relationships(prose),
    }
    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return

    print(f"CHAPTER: {chapter_path}")
    print()
    print(f"DATES ({len(result['dates'])}):")
    for d in result["dates"][:25]:
        y = d.get("year") or "????"
        print(f"  {y}-{d['month']:02d}-{d['day']:02d}  «{d['source_text']}»")
    print()
    print(f"DURATIONS ({len(result['durations'])}):")
    for d in result["durations"][:25]:
        print(f"  {d['value']:>4} {d['unit']:<8} «{d['source_text']}»")
    print()
    print(f"AGES ({len(result['ages'])}):")
    for a in result["ages"][:25]:
        print(f"  {a['value']:>3}  «{a['source_text']}»")
    print()
    print(f"RELATIONSHIPS ({len(result['relationships'])}):")
    from collections import Counter
    c = Counter((r["possessive"], r["role"]) for r in result["relationships"])
    for (poss, role), n in c.most_common(20):
        print(f"  {n:>3}× {poss} {role}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="story-canon")
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate", help="Validate a chapter against a canon YAML")
    v.add_argument("chapter", type=Path)
    v.add_argument("--canon", type=Path, default=None,
                   help="Path to canon YAML (auto-detected if omitted)")
    v.add_argument("--json", action="store_true",
                   help="Emit JSON instead of human-readable text")

    e = sub.add_parser("extract", help="Extract facts without validation")
    e.add_argument("chapter", type=Path)
    e.add_argument("--json", action="store_true")

    args = ap.parse_args()
    if args.cmd == "validate":
        cmd_validate(args)
    elif args.cmd == "extract":
        cmd_extract(args)


if __name__ == "__main__":
    main()
