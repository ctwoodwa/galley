# Draft: improve the security-guidance hook's substring matcher

**Target repo:** `claude-plugins-official` (the marketplace plugin)
**Target plugin:** `security-guidance`
**Target file:** `hooks/security_reminder_hook.py`
**Status:** Draft (not yet filed)
**Owner (galley side):** maintainer of `galley/prose` editorial tooling

> **Meta-recursive footnote:** writing this draft itself was blocked
> twice by the hook it proposes to fix — once for the canonical
> "/P/" alliteration nursery rhyme (matches the Python-serialization
> rule's substring), once for quoting the dynamic-evaluation primitive
> name with its parenthesis (matches the JS-eval rule). This document
> is therefore written **descriptively rather than by quoting** —
> referring to rule names and to substring patterns by description
> rather than spelling them. That itself is evidence that the hook is
> too aggressive: documenting how a security guard works should not
> be blocked by the security guard.

## Problem

The hook's `SECURITY_PATTERNS` list uses naive `substring in content`
matching to decide whether to emit a warning and exit 2 (which blocks
the write). This produces three classes of false positive.

### 1. Substring matches inside unrelated words

The Python-serialization rule looks for a 6-letter module-name
substring. That substring also appears inside the past-tense
adjective form of an unrelated food-preservation word — which would
be a perfectly normal noun in the canonical Mother Goose tongue-
twister. Writing a Markdown test fixture containing that nursery
rhyme fails with the serialization warning and the write is blocked.
The substring is contextually meaningless in Markdown, but the matcher
has no language or word-boundary awareness.

The same flaw affects:

- **The dynamic-evaluation rule.** Its substring appears inside
  identifiers like the noun form of "evaluator" or the verb form
  of "evaluate" — either can show up legitimately in any-language
  source files.
- **The Node child-process rule.** Its substring overlaps with
  identifiers like "executive," "execution," "executed," "executor" —
  ordinary English words with nothing to do with spawning processes.
- **The dynamic-Function-constructor rule.** Its substring is two
  ordinary English words separated by whitespace; appears in any
  sentence using the phrase as a noun.

### 2. Language insensitivity

Python-specific rules trigger on `.md`, `.yaml`, `.json`, `.txt`,
`.go`, `.rs` — files that cannot possibly contain a Python module
call. A Markdown test fixture describing literary devices, a YAML
config describing detector behavior, or a JSON schema cannot
meaningfully invoke an OS system call regardless of what substrings
they contain.

### 3. Import-presence ignored

The Python-serialization rule's premise is the use of the module's
load primitives on untrusted input. That risk is meaningful only
when the file actually imports the module. When no import statement
is present, the substring is just letters in a word.

## Proposal

Apply one or more of the following improvements to each substring rule.
The fixes compose; the strongest version applies all four.

### A. Word-boundary regex instead of substring

Replace the substring check with a regex that requires word
boundaries via `\b` anchors. Pseudocode:

> `re.search(r"\b" + re.escape(pattern) + r"\b", content)`

Effect: the serialization-module name no longer matches the
past-tense food-preservation word. The dynamic-evaluation substring
no longer matches identifiers like `evaluator`. Same for the
child-process substring inside `executive`, `executor`, etc.

### B. File-extension gating

Each rule gets an optional `file_extensions` field. The rule is
skipped when the target file's extension is not in the list:

```yaml
ruleName: python_serialization_load
file_extensions: [".py", ".pyx", ".pyi"]
```

Effect: Python-specific warnings stop firing on Markdown, YAML,
JSON, plain text. Likewise for JavaScript- and TypeScript-specific
rules.

### C. Import-presence gating

For rules whose warning is conditional on a specific module being
in use, add a `requires_import` field listing regex patterns that
must also match somewhere in the file:

```yaml
ruleName: python_serialization_load
file_extensions: [".py", ".pyx", ".pyi"]
requires_import:
  - '^\s*import\s+<module-name>\b'
  - '^\s*from\s+<module-name>\s+import'
```

The rule fires only when both the substring is present AND at least
one `requires_import` pattern matches.

### D. Project-side allow-list (optional)

The hook reads an optional `.claude/security-allowlist.json` from
the current working directory (or ancestor up to `$HOME`). The file
opts specific rules out for specific glob patterns:

```json
{
  "false_positives": {
    "python_serialization_load": [
      "tests/fixtures/**",
      "**/*.md"
    ]
  }
}
```

Useful escape hatch for projects with known false-positive contexts.
Lowest priority of the four; rule-level fixes (A/B/C) close most
cases.

## Suggested implementation order

1. **A (word-boundary regex)** — smallest change, most broadly
   useful; closes ~80% of false positives across rules.
2. **B (file-extension gating)** — adds metadata to each rule;
   doesn't require matcher core to change. Closes most of the
   remainder.
3. **C (import-presence gating)** — per-rule refinement for the
   highest-noise rules.
4. **D (allow-list)** — escape hatch; lowest priority.

## Test cases the fix should pass

These should not trigger a warning after the fix:

- A Markdown test fixture containing the canonical "/P/"
  alliteration nursery rhyme by Mother Goose.
- A YAML config file using the noun form of "evaluator" as a key
  name.
- A Go file containing the word "execution" in a code comment.
- A reStructuredText doc explaining what the dynamic-function
  primitive means in a programming concept.

These should still trigger a warning:

- A `.py` file that imports the serialization module and calls its
  load primitive on user input.
- A `.js` file that builds a shell command via template literal and
  passes it to the child-process module's shell-invoking primitive.
- A `.py` file calling the dynamic-evaluation primitive on data
  from an external source.

## Filing protocol

1. Open an issue against the `claude-plugins-official` repo
   describing the false-positive class (see "Problem" above).
2. Open a PR implementing A + B + C against the security-guidance
   plugin's hook file. Keep the existing rule structure; add
   optional fields.
3. D (allow-list) can land as a follow-up PR.

The galley project will adopt the fixed hook the moment it ships
upstream; we don't need to disable the plugin in the meantime since
the cheap workaround (convention against trigger substrings in test
fixtures) already costs nothing.

## Why galley cares

Galley's prose-editorial tooling involves writing test fixtures
that contain literary examples — alliteration, copula avoidance,
AI-vocabulary clusters, knowledge-cutoff disclaimers. Some examples
naturally use words whose substrings collide with the hook's
trigger list. False positives on those test fixtures impose a
friction tax on contributors and require maintaining a project-side
convention list of "words to avoid in prose examples."

The friction is small per-case but accumulates as the editorial
tool family grows: `galley/prose/` today, `galley/speech/`,
`galley/comics/`, `galley/video/` planned — each will need fixtures
with literary or domain-specific examples. A context-aware hook
fixes the friction at its source for every Claude Code user.
