"""prose-cli — unified CLI dispatcher for galley's prose tool family.

This package adds no detector logic. It routes `sys.argv` to the underlying
prose-telemetry and story-canon CLIs based on the first positional arg
(subcommand name).
"""

__version__ = "0.1.0"
