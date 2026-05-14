"""Unified `prose` CLI entry point.

Subcommands route to the underlying packages:

  prose measure <chapter.md>   -> prose_telemetry.cli.main (measure)
  prose validate <chapter.md>  -> story_canon.cli.main (validate)
  prose extract <chapter.md>   -> story_canon.cli.main (extract)
  prose --version              -> print versions of all three packages
  prose --help                 -> print this help

All other flags are forwarded transparently to the underlying CLI. Each
subcommand's own --help is reachable via `prose <subcommand> --help`.
"""

from __future__ import annotations

import sys


HELP_TEXT = """prose — unified CLI for galley's prose tool family

Usage:
  prose measure <chapter.md> [options]      Run prose-telemetry detectors + meters
  prose validate <chapter.md> [options]     Validate continuity against story-canon yaml
  prose extract <chapter.md> [options]      Extract continuity facts (no validation)
  prose --version                            Show version info
  prose --help                               Show this help

Subcommand help:
  prose measure --help
  prose validate --help
  prose extract --help

Background:
  https://github.com/[…]/galley/tree/main/prose
  See galley/prose/README.md and galley/prose/ROADMAP.md.
"""


def _print_versions() -> None:
    from importlib.metadata import version, PackageNotFoundError
    for pkg in ("prose-cli", "prose-telemetry", "story-canon"):
        try:
            print(f"{pkg} {version(pkg)}")
        except PackageNotFoundError:
            print(f"{pkg} (not installed)")


def main() -> None:
    argv = sys.argv

    if len(argv) < 2 or argv[1] in ("-h", "--help", "help"):
        print(HELP_TEXT)
        sys.exit(0)

    if argv[1] in ("-V", "--version", "version"):
        _print_versions()
        sys.exit(0)

    cmd = argv[1]

    if cmd == "measure":
        from prose_telemetry.cli import main as pt_main
        sys.argv = ["prose-telemetry", "measure", *argv[2:]]
        pt_main()
        return

    if cmd in ("validate", "extract"):
        from story_canon.cli import main as sc_main
        sys.argv = ["story-canon", cmd, *argv[2:]]
        sc_main()
        return

    print(f"prose: unknown subcommand '{cmd}'", file=sys.stderr)
    print(HELP_TEXT, file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
