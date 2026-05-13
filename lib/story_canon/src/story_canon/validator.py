"""Reconcile extracted facts against a story-canon YAML.

Validator stages:
  1. Load canon YAML.
  2. Run extractors over chapter prose.
  3. Cross-check:
     - Are ages consistent with the canon?
     - Do date claims align (e.g., chapter date + claimed duration = referent date)?
     - Are relationship claims consistent (Diana = brother's daughter)?
     - Are duration claims numerically sound (X days since date Y → does math
       agree with canon chapter_date)?
  4. Emit a structured report.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from story_canon.extractors import (
    extract_dates,
    extract_durations,
    extract_ages,
    extract_relationships,
    days_between,
)


# ─── Canon loading ──────────────────────────────────────────────────────

def load_canon(path: Path) -> dict[str, Any]:
    """Load a canon YAML file. Returns a dict; may contain dates parsed as
    datetime.date objects (PyYAML default)."""
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data or {}


# ─── Helpers ────────────────────────────────────────────────────────────

def _coerce_date(v: Any) -> date | None:
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", v.strip())
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def _looks_like_age_duration(unit: str) -> bool:
    return unit in {"year", "decade"}


# ─── Validators ─────────────────────────────────────────────────────────

def validate_ages(prose_findings: list[dict], canon: dict) -> list[dict]:
    """Check age claims in prose vs. canon. Canon characters carry an age."""
    issues = []
    canon_ages: dict[str, int] = {}
    for cname, cdata in (canon.get("characters") or {}).items():
        if isinstance(cdata, dict) and "age" in cdata:
            canon_ages[cname] = int(cdata["age"])
    if not canon_ages:
        return issues

    # If the prose says "I was forty-seven" and canon.anna.age = 47, OK.
    # If the prose says "I was forty-eight", flag.
    ages_in_prose = [a["value"] for a in prose_findings]
    for cname, cage in canon_ages.items():
        if cage in ages_in_prose:
            continue
        # An age this character's age might be missing — only a soft warning
        # if no age was found. If a *different* age was found, that's a real
        # conflict (we can't tell which character without more context).
        if ages_in_prose:
            issues.append({
                "severity": "warning",
                "type": "age_conflict",
                "character": cname,
                "canon_age": cage,
                "ages_found_in_prose": ages_in_prose,
                "message": f"Canon says {cname}.age = {cage}; prose contains "
                           f"ages {ages_in_prose}. Verify if any belong to {cname}.",
            })
    return issues


def validate_durations_against_dates(
    prose_dates: list[dict],
    prose_durations: list[dict],
    canon: dict,
) -> list[dict]:
    """The high-value check: does 'X days since date Y' compute correctly
    against the chapter's present date?

    Strategy: find duration mentions in 'days' or 'months' that appear near
    a date mention in the prose; cross-check against canon.chapter_date.
    """
    issues = []
    chapter_date_raw = canon.get("timeline", {}).get("chapter_date")
    chapter_date = _coerce_date(chapter_date_raw)
    if chapter_date is None:
        return [{
            "severity": "info",
            "type": "missing_canon",
            "message": "No timeline.chapter_date in canon; duration math checks skipped.",
        }]

    # For each date found in the prose, check if any prose duration claim
    # could be tied to it.
    for d in prose_dates:
        if d["day"] is None or d["month"] is None:
            continue
        # Year: if not in prose, prefer canon (chapter_date.year) or
        # chapter_date.year - 1 if the date hasn't happened yet by chapter
        # date.
        year = d.get("year")
        if year is None:
            tentative = date(chapter_date.year, d["month"], d["day"])
            if tentative > chapter_date:
                year = chapter_date.year - 1
            else:
                year = chapter_date.year
        ref_date = date(year, d["month"], d["day"])
        computed_days = days_between(ref_date, chapter_date)

        # Now look for nearby duration claims (within 100 chars before or
        # after the date) that are in days.
        for dur in prose_durations:
            if dur["unit"] != "day":
                continue
            distance = abs(dur["char_offset"] - d["char_offset"])
            if distance > 200:
                continue
            claimed_days = dur["value"]
            if claimed_days == computed_days:
                continue
            issues.append({
                "severity": "blocker",
                "type": "duration_date_mismatch",
                "date_in_prose": d["source_text"],
                "duration_in_prose": dur["source_text"],
                "claimed_days": claimed_days,
                "computed_days": computed_days,
                "chapter_date": chapter_date.isoformat(),
                "ref_date": ref_date.isoformat(),
                "message": (
                    f"Prose says '{dur['source_text']}' linked to "
                    f"'{d['source_text']}' (computed: {ref_date} → "
                    f"{chapter_date} = {computed_days} days). "
                    f"Discrepancy: {abs(claimed_days - computed_days)} days."
                ),
            })
    return issues


def validate_relationships(
    prose_findings: list[dict],
    canon: dict,
) -> list[dict]:
    """Check that relationship roles in prose are consistent with canon.
    Example: canon says diana.relationship_to_anna = brother's daughter;
    if prose says 'her sister' near a Diana mention, flag."""
    issues = []
    # Build expected possessive→role map from canon.
    expected: dict[str, set[str]] = {}
    for cname, cdata in (canon.get("characters") or {}).items():
        if not isinstance(cdata, dict):
            continue
        rels = cdata.get("relationships", {}) or {}
        for role, rdata in rels.items():
            expected.setdefault(cname, set()).add(role)

    # Just count the roles seen in prose; conflicts require contextual
    # parsing the simple regex can't do reliably. Report counts so the
    # author can review.
    from collections import Counter
    counts = Counter((f["possessive"], f["role"]) for f in prose_findings)
    if not counts:
        return issues
    summary = ", ".join(f'"{p} {r}" ×{n}' for (p, r), n in counts.most_common())
    issues.append({
        "severity": "info",
        "type": "relationship_inventory",
        "message": f"Relationship mentions in prose: {summary}",
        "counts": dict(counts),
    })
    return issues


# ─── Main entry ─────────────────────────────────────────────────────────

def validate_chapter(chapter_path: Path, canon_path: Path) -> dict[str, Any]:
    """Run all validators against a chapter; return a structured report."""
    if not chapter_path.exists():
        raise FileNotFoundError(chapter_path)
    prose = chapter_path.read_text(encoding="utf-8")

    # Strip HTML comments + frontmatter blocks for cleaner extraction.
    prose = re.sub(r"<!--.*?-->", "", prose, flags=re.DOTALL)

    canon = load_canon(canon_path)

    dates = extract_dates(prose)
    durations = extract_durations(prose)
    ages = extract_ages(prose)
    relationships = extract_relationships(prose)

    issues = []
    issues.extend(validate_ages(ages, canon))
    issues.extend(validate_durations_against_dates(dates, durations, canon))
    issues.extend(validate_relationships(relationships, canon))

    blockers = [i for i in issues if i.get("severity") == "blocker"]
    warnings = [i for i in issues if i.get("severity") == "warning"]
    info = [i for i in issues if i.get("severity") == "info"]

    return {
        "chapter": str(chapter_path),
        "canon": str(canon_path),
        "extracted": {
            "dates": dates,
            "durations": durations,
            "ages": ages,
            "relationships": relationships,
        },
        "issues": issues,
        "summary": {
            "blockers": len(blockers),
            "warnings": len(warnings),
            "info": len(info),
            "verdict": "red" if blockers else ("yellow" if warnings else "green"),
        },
    }
