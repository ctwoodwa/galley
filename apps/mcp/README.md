# galley-mcp — MCP server for AI agents

Exposes galley's prose-telemetry pipeline and book-management surface
to AI agents that speak [MCP](https://modelcontextprotocol.io/) —
Claude Desktop, Claude Code, and any third-party MCP-aware tooling.

## Tools

| Tool | Purpose |
|---|---|
| `galley_measure_chapter` | Run the registry pass on a chapter `.md`; return findings + metrics + verdict. |
| `galley_chapter_verdict` | Terse 'is this chapter clean?' — verdict + blocker/warning lists. |
| `galley_list_books` | Enumerate books registered with this galley install. |
| `galley_list_detectors` | Introspect the registered detector set (filter by family/tier). |
| `galley_init_book` | Scaffold `book.editorial.yaml` for a new book repo. |
| `galley_get_overlay` | Read the galley UI editorial overlay at `<bookRoot>/.galley/editorial.json`. |
| `galley_set_overlay` | Write the overlay (preset / activeVoice / voicePassMode). |
| `galley_get_profile` | Inspect the resolved BookProfile (yaml + overlay merged). |

Underlying logic lives in `galley_mcp.tools` (pure functions). The MCP
server in `galley_mcp.server` is a 1:1 wrapper. Tests exercise the
tools directly without spinning up the protocol layer.

## Install

galley-mcp reuses the prose-telemetry venv so detector registration
fires once. From the galley root:

```bash
source prose/lib/prose_telemetry/.venv/bin/activate
pip install mcp
pip install -e apps/mcp
deactivate
```

The console-script entry point `galley-mcp` is now on the venv's PATH.

## Wire up to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(create the file if absent):

```jsonc
{
  "mcpServers": {
    "galley": {
      "command": "/Users/christopherwood/Projects/SunfishSoftware/galley/prose/lib/prose_telemetry/.venv/bin/galley-mcp"
    }
  }
}
```

Restart Claude Desktop. The `galley_*` tools appear in the tool list.

## Wire up to Claude Code

Add to your project's `.mcp.json` or `~/.claude.json`:

```jsonc
{
  "mcpServers": {
    "galley": {
      "command": "/Users/christopherwood/Projects/SunfishSoftware/galley/prose/lib/prose_telemetry/.venv/bin/galley-mcp"
    }
  }
}
```

Then in a Claude Code session: `/mcp` to inspect, or just invoke
`galley_measure_chapter` like any other tool.

## Standalone CLI fallback

Agents that don't speak MCP can shell out to the underlying CLI:

```bash
prose-telemetry measure <chapter.md> --stdout | jq .registry_pipeline.verdict
```

Or hit the book-server HTTP API:

```bash
curl -s -X POST "http://localhost:3080/api/books/<bookId>/measure?chapter=<path>"
```

The MCP server, CLI, and HTTP endpoint all return the same
`registry_pipeline` JSON shape.
