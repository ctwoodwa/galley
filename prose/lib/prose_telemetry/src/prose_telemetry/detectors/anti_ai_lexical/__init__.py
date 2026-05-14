"""Anti-AI lexical detector pack.

One generic detector class (`LexicalLookupDetector`) plus N yaml data
files in this directory. Each yaml registers as its own named detector
with the central registry the moment this sub-package is imported.

Importing this package has the side effect of registering all yaml
detectors. Tests that need a clean registry should call
`prose_telemetry._common.registry.clear()` between the auto-register
and their assertions.

Usage:

    import prose_telemetry.detectors.anti_ai_lexical  # registers all

    from prose_telemetry._common import discover
    for entry in discover(family="anti_ai"):
        print(entry.name, entry.description)

To add a new lexical anti-AI pattern, drop a new yaml file in this
directory (see `_schema.yaml` in the same dir for the field set) and
re-import the package. The file's `name` field becomes the registry key.
"""

from pathlib import Path

from prose_telemetry.detectors.anti_ai_lexical.lookup import (
    LexicalLookupDetector,
    load_all_from_dir,
)


_HERE = Path(__file__).parent


# Auto-register all yaml-defined lexical detectors on package import.
# Detectors register against the central `prose_telemetry._common.registry`.
load_all_from_dir(_HERE)


__all__ = ["LexicalLookupDetector", "load_all_from_dir"]
