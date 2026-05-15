# Galley production graph — data-model spec

**Status:** Proposed (eight council passes, 2026-05-15; grade A+); informs Phase A + B.1 simultaneous release and Phase B data-shape implementation.
**Companion docs:** [`galley-platform-spec.md`](galley-platform-spec.md) (12-capability scope), [`plugin-architecture.md`](plugin-architecture.md) (extension model), [`galley-as-sunfish-accelerator.md`](galley-as-sunfish-accelerator.md) (Sunfish kernel relationship).
**External anchors:** MovieLabs *Ontology for Media Creation, Part 3: Assets* (v2.6); MovieLabs *Software-Defined Workflows* paper; Disney Animation pre-production technologies; Pixar's USD pipeline (asset-graph + lineage genealogy).

## Why a production graph

Galley today exposes books and chapters as filesystem entries. The Studio-Inspired spec (2026-05-15 CO directive) repositions galley as a **creative production operating system** — assets, scenes, shots, chapters, characters, notes, voice takes, reviews, and publishes as **first-class production objects** with explicit relationships, lineage, and workflow state.

The platform's job is no longer "edit a book" — it's **let the user understand, at any moment, what an object is, what state it's in, what it depends on, and what downstream work it affects.**

Galley remains local-first throughout. The production graph lives on disk under `<bookRoot>/.galley/` (the existing sidecar pattern). No central authority. No cloud requirement. Sync (when added) is between user-owned devices via Sunfish kernel-sync, not a galley service.

## Non-negotiables (carry forward from platform spec)

| Principle | How it applies to the graph |
|---|---|
| Local-first | Every object is a sidecar file. Filesystem is authoritative; the running app holds a derived index. |
| No silent cloud calls | Automation jobs that route to cloud plugins are flagged in their record; the user sees it. |
| User-owned state | Sidecar files live in the user's repo. Deleting `<bookRoot>/.galley/` is supported and recoverable from git + filesystem. |
| Audit-by-default | Every state change emits an event line to an append-only log. Authorship + timestamp on every change. |
| MIT, repo-wide | The model is the property of the user, not galley. |

## Object inventory

The graph has nine first-class object kinds plus an event log. Each kind has a stable type name (used in IDs, sidecar paths, schema discriminators), a sidecar location, and a small required-field core.

| Kind | Type tag | Sidecar location | Purpose |
|---|---|---|---|
| Production | `production` | `<bookRoot>/.galley/production.json` | Top-level container. One per book repo today; multi-production deployments add a registry later. |
| Narrative unit | `narrative-unit` | `<bookRoot>/.galley/narrative/<id>.json` | Books, chapters, scenes, sequences, episodes, storyboard sections. Hierarchical. |
| Asset | `asset` | `<bookRoot>/.galley/assets/<id>.json` | Manuscript, screenplay draft, note, storyboard panel, voice take, audio stem, illustration, export. |
| Task | `task` | `<bookRoot>/.galley/tasks/<id>.json` | Unit of work: draft, revise, annotate, narrate, review, approve, publish, deliver. |
| Participant | `participant` | `<bookRoot>/.galley/participants/<id>.json` (one file per participant) | Writers, editors, narrators, reviewers, producers, admins — the local directory. |
| Version | `version` | embedded in the parent object's `versions[]` array | Non-destructive history record per asset / narrative unit. |
| Publish | `publish` | `<bookRoot>/.galley/publishes/<id>.json` | A specific delivery: ePub build, audiobook bundle, panel-art PDF, etc. |
| Approval | `approval` | `<bookRoot>/.galley/approvals/<id>.json` | Reviewer + version + decision + rationale. State machine. |
| Comment | `comment` | `<bookRoot>/.galley/comments/<id>.json` | Frame- or passage-level annotation tied to a specific version. |
| Automation job | `job` | `<bookRoot>/.galley/jobs/<id>.json` | Background task event record: ingest / index / measure / transcribe / generate / export / publish. |
| Event log | `event` | `<bookRoot>/.galley/events.jsonl` (append-only) | The audit trail. Every state change emits one line. |

The IDs are stable URN-style strings: `galley:<production-id>:<type>:<short-id>`. Example: `galley:the-inverted-stack:asset:ch12-manuscript`. Short-ids are author-assigned slugs when natural (chapter ids, asset slugs), or generated ULIDs when not.

**Production-ID formation and stability:** The `production-id` segment is a human-readable slug derived from the book title at production scaffold time — lowercased, non-alphanumeric characters replaced by `-`, truncated to 48 characters (e.g., `"The Inverted Stack"` → `"the-inverted-stack"`). It is set **once** when B.1 first scaffolds the production and is **immutable for the lifetime of the production**. Renaming the book (changing `production.title`) does NOT change the production-id. If two productions produce the same slug, the user must disambiguate by appending a short suffix at creation time (e.g., `the-inverted-stack-2`). All cross-references in all sidecar files embed the production-id; it must never change because doing so would require rewriting every file in `.galley/`.

### Common fields (every object)

```json
{
  "id": "galley:<production>:<type>:<short-id>",
  "type": "asset" | "narrative-unit" | "task" | "participant" | "publish" | "approval" | "comment" | "job",
  "schemaVersion": 1,
  "createdAt": "2026-05-15T14:00:00Z",
  "createdBy": "galley:<production>:participant:<id>",
  "updatedAt": "2026-05-15T15:30:00Z",
  "updatedBy": "galley:<production>:participant:<id>",
  "tags": ["..."],
  "refs": {
    "belongs-to": [ "galley:..." ],
    "depends-on": [ "galley:..." ],
    "derived-from": [ "galley:..." ],
    "blocks": [ "galley:..." ],
    "supersedes": [ "galley:..." ],
    "consumes": [ "galley:..." ],
    "publishes-to": [ "galley:..." ]
  }
}
```

**`tags` field:** Tags are free-form UTF-8 strings — lowercase, hyphen-separated words, max 64 chars each, max 32 tags per object (e.g., `["audiobook", "chapter-draft", "needs-review"]`). They are not a controlled vocabulary. Galley does not maintain a dedicated tag index; consumers needing tag-filtered queries scan the sidecar files directly. Tag changes are written in-place as part of a normal `update` event — no separate tag-change event is emitted.

The `refs` object is the local view of the relationship graph. The system also maintains a derived global index (`<bookRoot>/.galley/_index/relationships.json`) for fast queries — that index is rebuilt from the sidecar files and is never authoritative. It stores a `lastBuilt` ISO-8601 timestamp; any read path that detects a newer sidecar mtime triggers a lazy rebuild before returning results.

**Index lifecycle (dirty-flag model):**
1. **Startup** — check `_index/meta.json` for `maxSidecarMtime`. If `_index/` is absent, `meta.json` is missing, or `maxSidecarMtime` is older than the filesystem high-water mark (single `readdir` + `stat` on the most-recently-modified sidecar directory), trigger a full rebuild. This is an O(1) check, not an O(n) sidecar scan.
2. **On any sidecar write** — mark dirty: write `_index/meta.json → { "dirty": true, "dirtyAt": "<ISO>" }`. Do NOT rebuild synchronously. Return 200 immediately.
3. **On any index read** — if `meta.dirty === true`, trigger a lazy full rebuild before serving results. This amortises rebuild cost across write bursts rather than paying it per-keystroke.
4. **Explicit flush** — `DELETE /api/productions/:id/index` drops `_index/` and returns 204; the next read rebuilds it.
5. **In-process cache** — any process that caches the index in memory MUST watch `_index/meta.json` for mtime changes (inotify / FSEvents / kqueue) and invalidate its in-process cache on change. Stale in-process caches are never acceptable even if the on-disk index is current.

### Per-kind shapes (core fields only — full schemas land in `packages/plugins/schemas/` when implemented)

#### Production

```json
{
  "id": "galley:<production-id>:production:root",
  "type": "production",
  "title": "The Inverted Stack",
  "kind": "book" | "screenplay" | "graphic-novel" | "animatic" | "mixed",
  "bookRoot": "/path/to/book",
  "activeVoice": "anna",
  "status": "in-development" | "in-production" | "in-post" | "wrapped" | "archived",
  "versioningBackend": "git" | "cache",        // B.1 auto-detects; never set manually — see detection rules below
  "eventCoverage": {
    "scaffold": "2026-05-15T00:00:00Z",  // set when B.1 runs
    "workflow": null,                       // set when B.2 runs
    "jobs": null,                           // set when B.3 runs
    "completeSince": null,                  // set to max(scaffold,workflow,jobs) when all non-null
    "note": "null = events for that phase absent; sidecars authoritative for prior history."
  }
}
```

**`versioningBackend` detection (B.1 scaffolding):**
- If `bookRoot/.git` exists → set `"git"`. Versions are computed via `git log --follow <sourcePath>`. Before passing a `sourcePath` to `git log --follow`, confirm the file is tracked by running `git ls-files --error-unmatch <sourcePath>`; if it returns non-zero, fall back to `"cache"` for that specific asset and emit a `verb: "warn"` event.
- Otherwise → set `"cache"`. Galley manages `_cache/<sha256>.bin` snapshots directly.
- Set ONCE at scaffold time; never changed manually.
- **Runtime fallback:** if `"git"` is declared but `bookRoot/.git` is absent at runtime, degrade to `"cache"` silently, emit `verb: "warn"` to `events.jsonl`, and surface "versioning backend degraded" in Dashboard exception conditions.

**`activeVoice` — currently selected TTS voice slot.** `activeVoice` is the label of the voice slot currently selected for TTS jobs in this production. The label MUST match a voice slot name declared in the book's plugin manifest; the plugin manifest is responsible for resolving the slot label to a concrete underlying voice model. `activeVoice` is NOT a reference to a `participant` (it does not point at a narrator participant), and it is NOT a direct model identifier — it names a manifest-resolved slot, so the underlying model can change without rewriting the production record. Default is `"default"` when the field is unset or `null`. The field is set by the user from the Workspaces/Admin surface and updated via a normal `update` event (no specialised verb). When a `transcribe` or `generate` job is dispatched without an explicit `inputs.voice` override, the dispatcher falls back to `production.activeVoice`; when both are absent the dispatcher uses the manifest's `"default"` slot.

#### Narrative unit

```json
{
  "id": "galley:<production>:narrative-unit:ch12",
  "type": "narrative-unit",
  "kind": "book" | "chapter" | "scene" | "sequence" | "episode" | "storyboard-section",
  "title": "Chapter 12 — The unmade scene",
  "sourcePath": "chapters/ch12.md",
  "status": "draft" | "revision" | "review" | "approved" | "locked"
}
```

**Narrative-unit status transition triggers:** Status transitions are driven by task completions or approval decisions — never by direct user edit of the `status` field. The system applies the transition and emits a `state-change` event with `context` set to the driving object's ID. `locked` is terminal; no transitions out.

| From | To | Trigger | `context` |
|---|---|---|---|
| `draft` | `revision` | A task whose `subject` is this unit completes (`state → done`) with `verb ∈ {revise, annotate}` | that task's ID |
| `draft` | `review` | A task whose `subject` is this unit completes with `verb = review` | that task's ID |
| `revision` | `review` | A task whose `subject` is this unit completes with `verb = review` | that task's ID |
| `review` | `approved` | An approval on this unit reaches `approved` or `approved-with-conditions` | that approval's ID |
| `review` | `revision` | An approval on this unit reaches `needs-changes` | that approval's ID |
| `approved` | `locked` | A task whose `subject` is this unit completes with `verb ∈ {publish, deliver}` | that task's ID |
| `approved` | `review` | The approval that drove `approved` is `withdrawn` (new approval required) | the withdrawn approval's ID |

Transitions not listed in this table are rejected by the writer at sidecar-write time.

**Book-root anchoring (mandatory):** The narrative unit of kind `"book"` that represents the production root MUST carry `refs["belongs-to"]: ["galley:<production>:production:root"]`. This is set automatically by the B.1 scaffolding step. It is a required invariant — without it, the Productions surface cannot compute `narrative-unit count` or navigate the hierarchy from the production record downward. All child narrative units (chapters, scenes, etc.) carry `belongs-to` pointing at their immediate parent in the hierarchy; the book-root is the only one that points at the `production` object itself.

**Hierarchy depth constraint (kind-agnostic).** The graph does NOT enforce a strict kind-to-kind adjacency table for `belongs-to` edges between narrative units, because different production kinds (`book`, `screenplay`, `animatic`, `graphic-novel`, `mixed`) compose the six narrative-unit kinds differently. Two rules are enforced by the writer; everything else is permitted. (1) **Book-kind anchoring:** a narrative-unit of `kind: "book"` MUST carry `refs["belongs-to"]` pointing at `production:root` and MUST NOT carry a narrative-unit parent — the book-kind is the top-level anchor under the production. (2) **Acyclicity:** `belongs-to` edges between narrative units form a DAG (enforced by the cycle policy under *Relationship vocabulary*; a child cannot be its own ancestor). All other parent-child kind combinations are accepted. The enumeration order in the `kind` union (`book` → `chapter` → `scene` → `sequence` → `episode` → `storyboard-section`) is the **canonical** prose-production hierarchy and the default a generator like B.1 emits, but it is not a constraint: a `scene` MAY belong directly to a `book` (skipping `chapter`) when the production's `kind` makes that appropriate, and `episode` and `storyboard-section` are designed for screenplay and animatic workflows whose hierarchies do not align with the prose ordering. UI surfaces that need to render a sensible tree compute depth from the actual `belongs-to` chain, not from the kind enumeration.

#### Asset

```json
{
  "id": "galley:<production>:asset:ch12-manuscript",
  "type": "asset",
  "kind": "manuscript" | "screenplay-draft" | "note" | "storyboard-panel" | "voice-take" | "audio-stem" | "illustration" | "export" | "canon-entry" | "style" | "measurement",
  "title": "Ch 12 manuscript",
  "sourcePath": "chapters/ch12.md",
  "mimeType": "text/markdown",
  "visibility": "production" | "restricted",
  "accessControl": {
    "allow": [ "galley:<production>:participant:<id>" ]
  },
  "versions": [
    {
      "v": "v0001",
      "createdAt": "2026-05-15T14:00:00Z",
      "createdBy": "galley:tis:participant:auteur",
      "note": "first pass",
      "checksum": "sha256:..."
    }
  ]
}
```

Asset is the workhorse object. The `kind` field distinguishes mediums; the `versions[]` array carries the non-destructive history. **There is no top-level `checksum` field on the asset** — the canonical current checksum is always `versions[versions.length - 1].checksum`. Writers MUST append a new entry to `versions[]` rather than mutating an existing one. Readers needing the current checksum read the last `versions[]` entry. Underlying bytes live at `sourcePath` (filesystem) or in a content-addressed cache (`<bookRoot>/.galley/_cache/`) when the asset is generated rather than authored. Versioning model varies by medium — see *Compare-first / versioning* below.

**`versions[].v` format and monotonicity.** The `v` field is a canonical version label: a literal `"v"` prefix followed by a four-digit zero-padded decimal integer, matching the regex `^v\d{4}$` (e.g., `"v0001"`, `"v0002"`, `"v0017"`). Version numbers are assigned monotonically by the writing tool, and every new entry appended to a given asset's `versions[]` MUST carry a numerically higher suffix than every previous entry on the same asset (strict monotonicity; no gaps required; no rewinds permitted). Because the prefix and width are fixed, lexicographic string order matches numeric order — this is what the approval-coverage check (`approvedBy[i].subjectVersion == publish.subjectVersion`) and the `publish.subjectVersion` label-sharing convention rely on; both sides perform plain string equality, and that equality is sound only when both writers conform. A tool that reads a non-conforming `versions[].v` (e.g., `"1.0.0"`, `"2024-05-15"`, `"abc123"`) MUST NOT reject the sidecar but MUST emit a `verb: "warn"` event naming the offending asset id and the non-conforming version string, and SHOULD NOT participate in the approval-coverage check for that version (degrades to "no covering approval" rather than silently matching on byte-equal junk). First version at scaffold time is `"v0001"`; the cap is `"v9999"` per asset (a safety bound on the format, not a working limit).

**`sourcePath` is always relative to `bookRoot`** — absolute paths are not permitted. Galley resolves `sourcePath` by joining it with `production.bookRoot` at read time. This keeps the book relocatable: moving the book directory only requires updating `production.bookRoot`; all asset paths remain valid. The same rule applies to `publish.outputPath` and `"path:"` entries in `job.outputs[]`. B.1 scaffolding writes `sourcePath` values as paths relative to `bookRoot`.

**`sourcePath` authority.** When an asset of `kind: "manuscript"` has `refs["belongs-to"]` pointing at a narrative-unit, both the asset sidecar and the narrative-unit sidecar carry a `sourcePath` field referencing the same file on disk. The **asset's `sourcePath` is authoritative** for content access — every read path that resolves the underlying bytes MUST go through the asset record, never the narrative-unit. The narrative-unit's `sourcePath` is a denormalised convenience field that lets the Workspaces surface open the editor without joining against the asset table, and it MUST be kept in sync with the parent manuscript asset's `sourcePath` by the write path: any update to `asset.sourcePath` atomically updates the parent narrative-unit's `sourcePath` in the same write operation (two `update` events written atomically to `events.jsonl` — one with `subject` = the asset, one with `subject` = the narrative-unit — both appended in a single `write(fd, buf)` syscall before the write returns success, and both sharing `summary: "sourcePath sync — <old> → <new>"` so the pair is identifiable in the audit log; if the `write(fd, buf)` call fails or returns a short write, the index marks the production as dirty and a startup reconciliation pass repairs the divergence). The narrative-unit's `sourcePath` is never updated independently — writers that attempt to mutate it directly are rejected at sidecar-write time. The coupling applies only to assets of `kind: "manuscript"` whose `refs["belongs-to"]` includes a narrative-unit; other asset kinds have no narrative-unit `sourcePath` to keep in sync and the dual-authority rule does not apply.

**`visibility` defaults to `"production"`** (all participants in the production can see it). Set to `"restricted"` and populate `accessControl.allow` to limit access. `accessControl` is ignored when `visibility: "production"`. B.1 scaffolding writes `visibility: "production"` and `accessControl: { "allow": [] }` for every auto-created asset.

#### Task

```json
{
  "id": "galley:<production>:task:ch12-revise-prose",
  "type": "task",
  "title": "Revise Ch 12 prose for pacing",
  "verb": "draft" | "revise" | "annotate" | "narrate" | "review" | "approve" | "publish" | "deliver",
  "assignee": "galley:tis:participant:auteur",
  "subject": "galley:tis:asset:ch12-manuscript",
  "state": "open" | "in-progress" | "blocked" | "done" | "cancelled",
  "dueAt": "2026-05-22T00:00:00Z",
  "priority": "low" | "med" | "high" | "urgent"
}
```

Tasks reference a single subject (the asset or narrative unit they work on) and a single assignee. Multi-assignee work is modelled as multiple tasks. **Single-subject is intentional** — tasks drive individual assignee action. A workflow spanning multiple assets (e.g., "approve the audiobook chapter" which touches both manuscript and voice-take) is modelled as an `approval` record on the parent narrative unit (which encompasses all its assets) rather than a task. If sibling tasks must gate each other, link them via `refs["depends-on"]`.

**Relationship to approval objects:** A task with `verb: "approve"` is an *assignment record* — it names the reviewer and surfaces the action in their task list. Completing the approve task (`state → done`) does **not** automatically create an `approval` sidecar record. The reviewer creates the approval record directly via the approval form; the task's `verb: "approve"` is the signal for the UI to surface that form. Once the reviewer submits an approval decision (any state except `pending`), the system sets the originating task to `done` and emits a `state-change` event on the task with `context` pointing at the new approval's ID. Task and approval remain separate sidecar objects, linked only through that event.

**State transition triggers:** Task state transitions are driven by assignee action, dependency-edge changes, or explicit user/admin intervention — never by silent system inference. Every transition emits a `state-change` event with `previousState` set to the prior value and `context` set to the driving object's ID (or `null` for user-direct changes). `done` and `cancelled` are terminal; a task in either state is immutable. Re-opening a `done` task is not supported in v1 — create a new task that `supersedes` the closed one.

| From | To | Trigger | Who | `context` |
|---|---|---|---|---|
| `open` | `in-progress` | Assignee begins work (explicit action: opens the workspace surface for the subject, or flips the task card) | assignee | `null` |
| `open` | `blocked` | (a) User/admin sets the block flag directly, OR (b) writer detects every task in `refs["depends-on"]` is in `blocked` or `cancelled` state | assignee, admin, or system | the blocking task's ID for (b); `null` for (a) |
| `in-progress` | `blocked` | Same as `open → blocked` | assignee, admin, or system | same as above |
| `in-progress` | `open` | Assignee pauses (explicit reset) | assignee | `null` |
| `blocked` | `open` | (a) User/admin clears the block flag, OR (b) writer detects at least one task in `refs["depends-on"]` has transitioned out of `blocked`/`cancelled` and the task was never `in-progress` before being blocked | assignee, admin, or system | unblocking task's ID for (b); `null` for (a) |
| `blocked` | `in-progress` | Same triggers as `blocked → open`, but applied when the task was `in-progress` before being blocked | assignee, admin, or system | same as above |
| `open` | `done` | Assignee marks complete | assignee | `null` |
| `in-progress` | `done` | Assignee marks complete | assignee | `null` |
| `open` | `cancelled` | Task creator, assignee, or admin cancels | creator, assignee, or admin | `null` |
| `in-progress` | `cancelled` | Task creator, assignee, or admin cancels | creator, assignee, or admin | `null` |
| `blocked` | `cancelled` | Task creator, assignee, or admin cancels | creator, assignee, or admin | `null` |

Transitions not listed are rejected by the writer at sidecar-write time. The system-driven `blocked` triggers (b-rows) are evaluated lazily on read of any task whose `depends-on` set includes a changed task; the writer also re-evaluates them on every write to any task in the production. The `block`/`unblock` event verbs cover `refs["blocks"]` edge adds/removes (distinct from the task's own `state` field); `state-change` covers the task's `state` transitions.

**Overdue is read-time only.** A task whose `dueAt` is non-null and earlier than now is NOT auto-transitioned to a new state and emits no event when the deadline passes; the Dashboard's "Overdue" query (see *Event audit log → Dashboard query contracts*) computes the condition on read, and acting on an overdue task means an explicit user action (cancel the task or update `dueAt`).

#### Participant

```json
{
  "id": "galley:<production>:participant:auteur",
  "type": "participant",
  "name": "The Auteur",
  "role": "writer" | "editor" | "narrator" | "reviewer" | "producer" | "admin",
  "deviceKeys": [ "ed25519:..." ],
  "email": "optional@example.com"
}
```

Single-user mode is the default: the participant `auteur` is auto-created on first run as `participants/auteur.json`. Multi-participant adds per-file entries. The per-file layout is consistent with every other object kind and makes future CRDT merge trivial — each participant file is independently mergeable without touching sibling records. B.1 scaffolding auto-migrates a legacy flat `participants.json` by fanning out into per-file records.

The `deviceKeys` field is forward-compat for the Sunfish kernel-security identity model.

The `role` field is a single value in v1 — an intentional simplification that keeps participant sidecars trivially CRDT-mergeable and the per-role index (`participants-by-role.json`) a clean partition. A multi-role individual (e.g., a self-published audiobook author who both writes and narrates) holds their **primary** role; this affects UI filtering and the default routing of new tasks, not hard capability enforcement. A participant with `role: "writer"` can still be assigned tasks with any verb, including `narrate`, `review`, or `produce` — task assignment is per-task and not gated by role. Multi-role support (`roles: string[]`) is deferred to post-v1 and is accommodated **without a schema-version bump**: the `role` field remains as the primary-role anchor, and an optional `roles` array is added alongside it when needed; readers that only know `role` continue to work, and readers that know `roles` treat `role` as the first/primary entry.

#### Publish

```json
{
  "id": "galley:<production>:publish:ebook-v0003",
  "type": "publish",
  "kind": "epub" | "audiobook" | "pdf" | "panel-pdf" | "animatic-mp4" | "static-site",
  "subject": "galley:tis:narrative-unit:book-root",
  "subjectVersion": "v0003",
  "outputPath": "build/output/tis-v0003.epub",
  "completedAt": "2026-05-15T16:00:00Z",
  "approvedBy": [ "galley:tis:approval:final-v0003" ]
}
```

A publish is a specific delivery artifact tied to a specific narrative-unit version. Distinct from rolling-build outputs (those are jobs).

**`approvedBy` and `subjectVersion` semantics:** `approvedBy` is optional and defaults to `[]`. An empty array means the publish was not formally approved — this is permitted and is the common case for internal previews, draft exports, and author-only build runs. Galley does not gate publishing on approval coverage; the user is the authority.

The B.2 write path enforces a coverage check only when `approvedBy` is non-empty: at least one referenced approval MUST have `subjectVersion == publish.subjectVersion`. A mismatch is a consistency warning surfaced in the Reviews surface and emitted as a `verb: "warn"` event; the write is not rejected.

When `publish.kind ∈ {"epub", "audiobook"}` and the publish's narrative-unit subject is in `status ∈ {"approved", "locked"}`, `approvedBy` SHOULD contain at least one entry. A `kind`/`status` pairing that suggests a finished deliverable paired with an empty `approvedBy` is surfaced as a `verb: "warn"` event and counted under Dashboard "exception conditions" — but the write succeeds. This treats approval coverage as observable governance, not an enforcement gate; lock-down enforcement is deferred until kernel-security signing is wired (see "What's deferred").

**`publish.subjectVersion` is the publish artifact's own iteration identifier**, not a reference into asset `versions[]`. It is set by the publishing plugin and increments per successive publish of the same `kind` against the same `subject` (the first ePub is `"v0001"`, the second is `"v0002"`, and so on; audiobook and ePub sequences increment independently because they are different `kind`s). It is always non-null, regardless of whether `subject` is an asset (which carries `versions[]`) or a narrative-unit (which does not, per R2). This is semantically distinct from `approval.subjectVersion`, which pins to an asset `versions[].v` when the approval covers an asset and is `null` when the approval covers a narrative-unit. The approval-coverage check at the B.2 write path (`approvedBy[i].subjectVersion == publish.subjectVersion`) works because the approval is authored BEFORE the publish runs: the reviewer approves "version v0003 of this content," and the publishing plugin then tags the resulting publish record with the same `"v0003"` string. The version string is shared at the narrative-unit level by convention — reviewers, authors, and the publish pipeline all refer to the same human-readable iteration label for a given pass over the content, even though the narrative-unit object itself stores no `versions[]` array.

**Job-to-publish lifecycle:** A `publish` record is created by the system when a `verb: "publish"` job succeeds. The job is the execution record; the publish is the delivery artifact record.
1. User requests publish → job created (`state: "queued"`)
2. Job runs → `state: "running"`
3. Job succeeds → publish record created; `publish.completedAt` copied from `job.completedAt`; job gets `outputs: ["galley:...:publish:<id>"]`
4. Job fails → no publish record; job `state: "failed"` with `logExcerpt`

**Offline reconciliation:** if the book-server was offline when a publish job completed (e.g., a Tauri app queued the job and then closed), the publish record will not exist when the server restarts. On startup, the server scans `jobs/` for any `state: "succeeded"`, `verb: "publish"` job with no corresponding entry in `publishes/` and creates the missing publish record. This reconciliation runs as part of the B.1 startup scaffold scan.

#### Approval

```json
{
  "id": "galley:<production>:approval:ch12-v0007",
  "type": "approval",
  "subject": "galley:tis:asset:ch12-manuscript",
  "subjectVersion": "v0007",
  "reviewer": "galley:tis:participant:editor",
  "state": "pending" | "needs-changes" | "approved" | "approved-with-conditions" | "withdrawn",
  "decidedAt": "2026-05-15T15:00:00Z",        // null when state is pending or withdrawn
  "rationale": "Pacing fix landed. Final pass clean.",
  "withdrawnAt": null,                          // set when state reaches withdrawn
  "withdrawnBy": null,
  "withdrawalNote": null
}
```

**State machine:**

| From | To | Who | Condition |
|---|---|---|---|
| `pending` | `needs-changes` | reviewer | Feedback posted |
| `pending` | `approved` | reviewer | Approval granted |
| `pending` | `approved-with-conditions` | reviewer | Conditional approval |
| `pending` | `withdrawn` | reviewer or admin | Retraction before decision |
| `needs-changes` | `approved` | reviewer | Re-review after revision (new record on new version) |
| `needs-changes` | `withdrawn` | reviewer or admin | Retraction before decision |
| `approved` | — | — | Terminal — immutable |
| `approved-with-conditions` | — | — | Terminal — immutable |
| `withdrawn` | — | — | Terminal |

`decidedAt` is set when state reaches `approved`, `approved-with-conditions`, or `needs-changes`. It is `null` when state is `pending` or `withdrawn` (no formal decision was reached). `withdrawnAt` is set when state reaches `withdrawn`. A decided approval cannot be withdrawn — create a new approval on the corrected version instead.

**`subjectVersion` semantics by subject kind:** `subjectVersion` is `string | null`.

- When `subject` references an **asset**, `subjectVersion` SHOULD be set to the specific `versions[].v` value being approved (e.g., `"v0007"`). Asset approvals pin to a versioned snapshot; the index uses this to enforce approval-coverage checks at publish time (see Publish section).
- When `subject` references a **narrative-unit**, `subjectVersion` MUST be `null`. Narrative units have no `versions[]` array — their state is captured by the `status` field, which is itself driven by approval decisions (see the narrative-unit trigger table). A narrative-unit approval covers the unit's current composite state at the moment of decision, not a versioned snapshot.

The B.2 write path MUST NOT reject approvals with `subjectVersion: null` when the subject is a narrative-unit, and MUST NOT reject approvals with a non-null `subjectVersion` when the subject is an asset. The reverse pairings (null on an asset subject, non-null on a narrative-unit subject) are accepted but emit a `verb: "warn"` event — they are valid records of historical or imported approvals where version pinning was unavailable.

#### Comment

```json
{
  "id": "galley:<production>:comment:c-01j...",
  "type": "comment",
  "subject": "galley:tis:asset:ch12-manuscript",
  "subjectVersion": "v0007",          // string | null — null means not pinned to a specific version
  "anchor": {
    "kind": "passage" | "frame" | "timecode" | "panel" | "page",
    "spec": "..."
  },
  "author": "galley:tis:participant:editor",
  "body": "Markdown body.",
  "resolved": false,
  "replyTo": null
}
```

`subjectVersion` is `string | null`. A non-null value (e.g., `"v0007"`) pins the comment to that specific version; review tooling surfaces it primarily in that version's context. A `null` value means the comment is not pinned — it applies to the asset as a whole at time of authoring and remains visible across all versions. Implementations MUST accept `null` on write; omitting the field is normalized to `null` on read. `null` is the correct value during active drafting before any version exists.

`replyTo` is `null` for root comments; set to the direct parent comment ID for replies. Depth is bounded at 2 levels in v1 (root comment + one reply layer) — the index computes `replies → [comment-ids]` from the `replyTo` field. The `thread` field name from earlier drafts is retired; it was ambiguous between "parent", "root", and "next-in-thread" topologies.

`anchor.kind` is medium-specific. The `spec` string format is canonical — implementations MUST emit and parse exactly these formats. Non-conforming specs are stored but not indexed (UI warns "anchor format unrecognised"). **Indexing convention:** all kinds except `page` are 0-indexed internally; display layers add 1 for rendering. `page` is 1-indexed because it is always the display value — the display layer does NOT add 1 to page numbers.

| `kind` | `spec` format | Convention | Example |
|---|---|---|---|
| `passage` | `"L<line>:C<char>-L<line>:C<char>"` | **0-indexed** line and char (LSP `Position` compatible); display layers add 1 for rendering | `"L11:C3-L13:C9"` |
| `frame` | `"<start>-<end>"` | 0-indexed integer frame numbers | `"1204-1340"` |
| `timecode` | `"<HH:MM:SS.mmm>-<HH:MM:SS.mmm>"` | SRT-compatible; millisecond precision | `"00:03:21.500-00:03:45.200"` |
| `panel` | `"<panel-id>"` | Galley short-id of the panel asset | `"panel-003b"` |
| `page` | `"<page>:<x>,<y>,<w>,<h>"` | Page **1-indexed** — matches human-visible page number in rendered output. Display layer does **NOT** add 1. x/y/w/h are 0–1 normalised floats (top-left origin) | `"12:0.25,0.10,0.50,0.30"` |

**`resolved` is a one-way write.** Once a comment's `resolved` field is set to `true`, it MUST NOT be set back to `false`; writers that attempt the `true → false` transition MUST be rejected at sidecar-write time. No `unresolve` event verb exists in the canonical vocabulary. A reviewer who needs to re-open a resolved issue creates a new comment — or a reply with `replyTo` set to the resolved comment's id — and the audit trail reads unambiguously: the original issue was resolved at T, and any re-emergence is recorded as a fresh comment at T+N rather than as a mutation of the closed record.

#### Automation job

```json
{
  "id": "galley:<production>:job:01j...",
  "type": "job",
  "verb": "ingest" | "index" | "measure" | "transcribe" | "generate" | "export" | "publish" | "thumbnail",
  "state": "queued" | "running" | "succeeded" | "failed" | "cancelled",
  "subject": "galley:tis:asset:ch12-manuscript",
  "inputs": { "preset": "standard" },
  "outputs": [
    "galley:tis:asset:ch12-measurement",
    "path:build/output/audiobook/_chunk_cache/ch12-v0002.opus"
  ],
  "startedAt": "2026-05-15T14:00:00Z",
  "completedAt": "2026-05-15T14:00:08Z",
  "logExcerpt": "...",
  "routedTo": {
    "kind": "local" | "cloud",
    "plugin": "anthropic-claude"
  }
}
```

Routing transparency: when a job touches a cloud plugin, `routedTo.kind: "cloud"` is set. The UI surfaces this on every job card so the user always knows when work left the device.

`outputs[]` entries take two forms: `"galley:<id>"` for outputs registered as managed galley assets, and `"path:<relative-path>"` for build artifacts that galley tracks but does not promote to managed objects (thumbnails, chunk-cache files, measurement intermediates). The verb determines which form applies:

| Job verb | Output form | Registered asset? |
|---|---|---|
| `measure`, `transcribe` | `galley:asset` | Yes — queryable, versioned |
| `generate` (image / audio) | `galley:asset` | Yes — versioned, has lineage |
| `export`, `publish` | `galley:asset` | Yes — linked to publish record |
| `thumbnail`, `index` | `path:` | No — build artifact only |

**`job.inputs` schema:** Input shapes are verb-scoped and declared by each plugin in its plugin manifest (not defined in this core spec). The book-server validates `inputs` against the plugin's declared schema at job-enqueue time; unknown verbs are rejected. Built-in verbs (`ingest`, `index`, `measure`, `transcribe`, `generate`, `export`, `publish`, `thumbnail`) declare their schemas in `galley-core/src/verb-schemas.ts`. The `inputs` object stored in the job sidecar is the raw value as received; no transformation is applied at write time. New optional fields added to a verb schema MUST carry a default value in the schema so existing job records remain valid without migration.

#### Event (the audit log)

`<bookRoot>/.galley/events.jsonl` — one JSON object per line, append-only, never edited.

```json
{ "id": "01j...", "at": "2026-05-15T14:00:00Z", "by": "galley:tis:participant:auteur", "verb": "create", "subject": "galley:tis:asset:ch12-manuscript", "summary": "create asset ch12-manuscript v0001" }
{ "id": "01j...", "at": "2026-05-15T14:30:00Z", "by": "galley:tis:participant:auteur", "verb": "update", "subject": "galley:tis:asset:ch12-manuscript", "summary": "version v0002 — pacing pass" }
{ "id": "01j...", "at": "2026-05-15T15:00:00Z", "by": "galley:tis:participant:editor", "verb": "approve", "subject": "galley:tis:approval:ch12-v0002", "summary": "approved with conditions" }
```

The log is the canonical history. Object sidecars can be rebuilt from events (event-sourcing-friendly). When sync via kernel-sync arrives, events are the natural unit of replication.

**`by` for system-generated events:** Events emitted by the book-server process itself (`scaffold`, `migrate`, `index-rebuilt`, `warn`) use the reserved sentinel `"galley:system"` as the `by` value. This is not a participant object and has no corresponding sidecar file. Implementations MUST NOT create a participant with the id `system`. No other sentinel values (`null`, empty string) are valid for the `by` field.

**Canonical event verb vocabulary:**

| Verb | Phase | Emitted when |
|---|---|---|
| `scaffold` | B.1 | Bulk-create of production + narrative units + assets on first book-open |
| `create` | B.1+ | Any single object created after scaffold |
| `migrate` | B.1 | Legacy artefact fan-out (e.g., `participants.json` → per-file) |
| `update` | B.2+ | Any field on an existing object updated |
| `state-change` | B.2+ | An object's `state` or `status` field transitions |
| `assign` | B.2+ | `task.assignee` set or changed |
| `approve` | B.2+ | Approval reaches `approved` or `approved-with-conditions` |
| `needs-changes` | B.2+ | Approval reaches `needs-changes` |
| `withdraw` | B.2+ | Approval reaches `withdrawn` |
| `comment` | B.2+ | Comment created |
| `resolve` | B.2+ | Comment `resolved` set to `true` |
| `publish` | B.2+ | Publish record created |
| `block` | B.2+ | `refs["blocks"]` edge added |
| `unblock` | B.2+ | `refs["blocks"]` edge removed |
| `job-queued` | B.3+ | Job created with `state: "queued"` |
| `job-started` | B.3+ | Job transitions to `state: "running"` |
| `job-succeeded` | B.3+ | Job transitions to `state: "succeeded"` |
| `job-failed` | B.3+ | Job transitions to `state: "failed"` |
| `job-cancelled` | B.3+ | Job transitions to `state: "cancelled"` |
| `warn` | Any | Degradation or backend fallback (e.g., git→cache) |
| `index-rebuilt` | Any | Index rebuild completed |
| `deleted` | Any | Object soft-deleted (see deletion protocol) |

**`events.jsonl` is single-writer in v1.** Only the book-server process appends to `<bookRoot>/.galley/events.jsonl`; concurrent multi-process writes to this file are not supported. When the Tauri desktop shell is operating offline (or otherwise running without a live book-server attached), it MUST NOT write directly to `events.jsonl`. Instead, it appends each event to a write-ahead buffer at `<bookRoot>/.galley/_offline-events.jsonl` using the same one-JSON-object-per-line format. On reconnect, the book-server drains `_offline-events.jsonl` into `events.jsonl` in ascending `at` (timestamp) order, then truncates the buffer; the drain is itself a sequence of `write(fd, buf)` appends against `events.jsonl` and inherits the same atomicity contract as native appends. This preserves the single-writer invariant — every line in the canonical log was appended by exactly one process — and defers true multi-process concurrent event authoring to the CRDT merge phase introduced with kernel-sync (post-v1). The buffer file `_offline-events.jsonl` is itself single-writer (only the Tauri shell writes it), is not read by anything except the book-server's drain routine, has no sidecar shape, no index entry, and is not part of the canonical history until drained.

**`state-change` events carry two additional fields** beyond the common shape: `"previousState"` (the value before the transition) and `"context"` (the galley ID of the task or approval that drove the state change, or `null` for user-direct changes). This lets the Dashboard query "what state changes happened to this asset" (filter by `subject`) AND "what tasks drove state changes" (filter by `context`) without a second lookup.

**Dashboard query contracts:**
- "In motion": `state-change` + `assign` + `job-queued` + `job-started`
- "Blocked": `block` + `job-failed`
- "Pending reviews": `approve` + `needs-changes` + `withdraw` cross-referenced with approval `state`
- "Recent publishes": `publish` events in last N days
- "Exception conditions": `warn` + `job-failed` + any `state-change` to a blocked or failed state
- "Overdue": tasks where `state ∈ {open, in-progress, blocked}` AND `dueAt` is non-null AND `dueAt < now`. Computed at Dashboard read time from the task sidecar's `dueAt` field and the current timestamp; no event drives it (no `warn` is emitted, no `state-change` fires). Overdue is a surface flag, not a stored state.

## Relationship vocabulary

Seven verbs total. Each is directional. The reverse relation is implied (computed via the index).

| Verb | Forward direction | Reverse name (computed) | Example |
|---|---|---|---|
| `belongs-to` | Child → parent | `contains` | `chapter-12 belongs-to book-tis` |
| `depends-on` | Successor → predecessor | `blocked-by` | `audiobook-export depends-on voice-pass` |
| `derived-from` | Output → input (lineage) | `derived-into` | `audio-stem derived-from manuscript v0002` |
| `blocks` | Blocker → blocked | `blocked-by` | `legal-hold blocks publish` |
| `supersedes` | New → old | `superseded-by` | `ch12-rewrite supersedes ch12-original` |
| `consumes` | Asset → input asset | `consumed-by` | `final-mix consumes ch12-stem-A` |
| `publishes-to` | Publish → channel/target | `published-from` | `ebook-v0003 publishes-to leanpub` |

**Reviewer relationships are NOT in `refs`.** They are captured by `approval` objects, which carry a first-class `reviewer` field pointing at a participant. The index computes `reviewer → [approval-ids]` from approval sidecars. Using `refs["reviewed-by"]` would create a second, redundant and inevitably divergent record of the same relationship; approval objects are the single canonical source.

Edges are stored on the SOURCE object's `refs` field. The relationship index rebuilds reverse lookups (`contains`, `derived-into`, etc.) by scanning every sidecar.

**Cycle policy.** `depends-on` and `blocks` cycles are detected by the index builder via DFS on the directed edge set (O(n) over sidecars; no lock required) and surfaced as `verb: "warn"` events listing the cycle members (`{ "cycle": ["galley:...", "galley:...", "galley:..."], "verb": "depends-on" }`). The write is NOT rejected — provisional cycles are legitimate during in-flight work (e.g., two chapters mutually `depends-on` each other while interleaved revisions land). The Dashboard surfaces active cycles under exception conditions; resolution is a user action, not a system action. `supersedes` is checked separately: a supersession cycle (`A supersedes B supersedes A`, transitively) would make lineage reconstruction impossible and is rejected at sidecar-write time with the offending edge named in the error. The remaining verbs (`belongs-to`, `derived-from`, `consumes`, `publishes-to`) do not require cycle detection — `belongs-to` cycles are prevented by the hierarchy invariant (a child cannot be its own ancestor; the writer rejects this), and `derived-from` / `consumes` / `publishes-to` are append-mostly lineage edges where a cycle is semantically meaningless but harmless to the index.

## Sidecar layout under `<bookRoot>/.galley/`

```
<bookRoot>/.galley/
├── production.json                # single production record
├── participants/                  # one file per participant (per-object, CRDT-safe)
│   ├── auteur.json
│   └── editor.json
├── editorial.json                 # (existing) preset, voice, voicePassMode
├── services.json                  # (planned) per-book service slot overrides
├── events.jsonl                   # append-only audit log
├── narrative/
│   ├── book-root.json
│   ├── ch01.json
│   ├── ch02.json
│   └── ...
├── assets/
│   ├── ch01-manuscript.json
│   ├── ch01-audio-en.json
│   └── ...
├── tasks/
│   ├── 01j-revise-ch12.json
│   └── ...
├── approvals/
│   ├── ch12-v0007.json
│   └── ...
├── comments/
│   ├── c-01j....json
│   └── ...
├── publishes/
│   ├── ebook-v0003.json
│   └── ...
├── jobs/
│   ├── 01j-measure-ch12.json
│   └── ...
├── chats/                         # (existing) per-chapter chat history
│   └── <chapterId>.json
└── _index/                        # derived; safe to delete
    ├── relationships.json
    ├── participants-by-role.json
    └── ...
```

**Path relativity rule:** all file-path fields in sidecar records (`asset.sourcePath`, `publish.outputPath`, `"path:"` entries in `job.outputs[]`) are **relative to `bookRoot`**. Absolute paths are not written by any galley code. The book is relocatable by updating `production.bookRoot` alone.

The `_index/` directory is purely derived — rebuilt from authoritative sidecars and `events.jsonl` on startup, lazily on any read after a dirty-flag write, or on explicit `DELETE /api/productions/:id/index`. Users never need to touch it; deleting it triggers a rebuild on next read. `_index/meta.json` records `{ "lastBuilt": "<ISO>", "maxSidecarMtime": "<ISO>", "dirty": false, "dirtyAt": null }` — `maxSidecarMtime` is the high-water mark of all sidecar mtimes at the time of the last build, enabling O(1) startup staleness detection.

## Compare-first / versioning per medium

The platform spec calls for compare-first workflows across writing, audio, visual, metadata. The versioning model differs by medium but the **`asset.versions[]`** shape is unified.

| Medium | What "version" means | Compare implementation |
|---|---|---|
| Prose (manuscript) | A snapshot of the file's content per version record. **Two mutually exclusive backends per book** (declared in `production.versioningBackend`): (1) `"git"` — `versions[]` wraps `git log --follow <sourcePath>`; no `_cache/` copy maintained; requires the book root to be a git repo. (2) `"cache"` — `_cache/<sha256>.bin` snapshots; `versions[]` populated by galley directly; used when the book is not a git repo. A book never mixes both. | Diff at line/word granularity; surface in the workspace view side-by-side or inline (toggle). |
| Audio (TTS render / take) | A render output keyed by `(voice, preset, source-checksum)`. The Inverted Stack's existing chunk cache (`build/output/audiobook/_chunk_cache/`) is the prototype. | Sentence-aligned A/B player; the existing audio-editor chunk model is the basis. |
| Image (panel art / cover) | A generated image keyed by `(prompt, model, seed, controlnet-set)`. | Side-by-side viewer; per-region diff overlay; pinned color points. |
| Storyboard | A panel set keyed by `(scene, sequence)`. | Strip view with version toggle; per-panel diff annotations. |
| Metadata (canon, preset, profile) | A snapshot of the YAML/JSON record. | Structured diff (key/value pairs added/removed/changed). |

Across all mediums, `asset.versions[i]` records `createdAt`, `createdBy`, `note`, `checksum`, and any kind-specific generator inputs. Provenance — the `derived-from` chain — is what makes the compare meaningful: "this audio v0003 was derived-from manuscript v0007, which has approval state pending."

## How IA maps to data

The Studio-Inspired spec's top-level navigation maps onto the production graph as follows:

| Nav surface | Data source | Above-the-fold contract |
|---|---|---|
| **Dashboard** | `events.jsonl` recent window + queries over open tasks/approvals/jobs/blockers | Production status by major narrative unit, active blockers, pending reviews, recent publishes, exception conditions. Drill-down links to the exact asset/task/review. |
| **Productions** | `production.json` (plus future registry for multi-production) | Title, kind, status, narrative-unit count, latest publish, slate of in-flight tasks. |
| **Workspaces** | A narrative-unit + its assets + active tasks + comments + approvals (composite query) | The primary artifact (medium-adapted viewer), version timeline, linked assets, tasks, comments, approvals, dependency state — single persistent context. |
| **Assets** | `assets/<id>.json` + relationship index | Asset name, type, kind, owner, current version, status, consuming work, related tasks, version history, review outcomes. Pivot to every workspace consuming it. |
| **Reviews** | `approvals/<id>.json` filtered by reviewer + state | Side-by-side compare, frame/passage comments, approval state, reviewer history, audit trail. |
| **Tasks** | `tasks/<id>.json` filtered by assignee + state + due date | Open tasks per assignee, blockers, dependencies, priority, due window. |
| **Search** | Across titles, metadata, relationships, participants, statuses, comments | Faceting by object type, review state, version status, participant, production context, dependency state. |
| **Admin** | Plugin registry, service config, participants, policy | System health, plugin routing, policy, schema, auditability. Already shipped today as Settings + Services + Plugin manifests. |

The Dashboard surface is essentially **a saved query** over the other surfaces — "show me everything currently in motion or blocked." It doesn't store its own data.

## Security + governance

| Concern | Approach |
|---|---|
| **Sensitive drafts** | An asset can declare `visibility: "restricted"` and `accessControl: { allow: ["galley:...:participant:editor"] }`. The UI gates view + share + publish accordingly. Default is `visibility: "production"` (anyone in the production). |
| **Authorship** | Every event line carries `by`. Versions, comments, approvals, publishes all record creator. |
| **Audit** | The events.jsonl log is the audit trail. Every publish, approval, or access-sensitive action emits an event with summary + before/after refs. |
| **Watermarking** | Restricted-share renders for video/image stamp the recipient + timestamp into the output. Implementation lives in the export pipeline; record lives in the publish object. |
| **Signing** | Forward-compat with the Sunfish kernel-security identity model. The `participant.deviceKeys[]` field is where per-device Ed25519 public keys land; events can be signed by the creating device. Not enforced in v1. |
| **Hidden cloud routing** | Any job record whose `routedTo.kind === "cloud"` is flagged visually and counted in the "off-device work" rollup on the Dashboard. Users never have to guess where their content went. |

## Deletion protocol

V1 uses **soft delete only**. Hard delete is not supported. Any object may be soft-deleted by adding two fields to its sidecar:

```json
{
  "deletedAt": "2026-05-15T16:00:00Z",
  "deletedBy": "galley:the-inverted-stack:participant:editor"
}
```

The sidecar file is retained on disk. On soft-delete, the system appends a `verb: "deleted"` event to `events.jsonl` with `subject` set to the deleted object's ID and `context: null`. The `_index/` excludes soft-deleted objects from all query results but retains their entry (with `deleted: true`) so dangling-ref checks can still resolve them. Dangling refs (a live object's `refs` field points at a soft-deleted object) are permitted in v1 — the index surfaces them as a `warn` condition, not an error. Restoring a soft-deleted object (setting `deletedAt: null`) is not defined in v1; treat it as out of scope.

**`.galley/` git tracking:** The `.galley/` directory SHOULD be committed to git when the book is a git repository. This makes sidecar files recoverable from `git` history and enables the `versioningBackend: "git"` path for prose assets. If the book team chooses to gitignore `.galley/` (e.g., for large audio/image blob stores), the `versioningBackend` must be set to `"cache"` and recovery from sidecar loss is not guaranteed. The book-server warns on startup if `versioningBackend: "git"` is declared but `.galley/` is gitignored.

## Migration from today's state

Galley today has:
- Books with chapter Markdown files (the authored prose)
- Per-book `.galley/editorial.json` (editorial overlay)
- Per-chapter `.galley/chats/<chapterId>.json` (chat history)
- A render queue in `/api/jobs` (visible in the legacy reader)
- Plugin manifests (17 today) for service routing

Migration to the production graph:
1. **Day 1 (scaffold):** When galley opens a book, if `<bookRoot>/.galley/production.json` is absent, scaffold a default production + narrative units derived from the existing chapter list. Auto-create a participant `auteur` for the local user as `participants/auteur.json`. If a legacy flat `participants.json` exists, fan its entries out into per-file records in `participants/`, then rename `participants.json` → `participants.json.bak` (retained for one release cycle; removed by a cleanup step in the following release).
1a. **Scaffold crash-safety (B.1 atomicity).** B.1 scaffolding writes a marker pair to make the operation re-entrant under crash, kill, or disk-full conditions. At the start of scaffolding the worker writes `<bookRoot>/.galley/_scaffold.lock` with `{ "startedAt": "<ISO>", "pid": <pid>, "schemaVersion": 1 }` (O_EXCL create — concurrent starts find the existing lock and back off). On successful completion the worker atomically renames the lock file to `<bookRoot>/.galley/_scaffold.complete` with `{ "completedAt": "<ISO>", "schemaVersion": 1 }`. On every startup the server checks both markers:
    - `_scaffold.complete` present AND `complete.schemaVersion` ≥ current → scaffold is clean; proceed.
    - `_scaffold.lock` present AND `_scaffold.complete` absent → previous scaffold was interrupted; re-run the scaffold step (idempotent — creating an existing sidecar is a no-op merge, not an overwrite; the lock file's `startedAt`/`pid` is overwritten).
    - `_scaffold.complete` present AND `complete.schemaVersion` < current → schema migration required; re-run the scaffold step under the same crash-safety contract with `schemaVersion` advanced to the target on success.
    - Neither marker present → first scaffold; proceed normally.
   The startup dirty-flag check on `_index/` is independent — scaffold completeness gates index validity (an incomplete scaffold leaves `_index/meta.json` unwritten, which the dirty-flag check treats as stale and triggers a rebuild once scaffold completes).
   **Relationship to per-sidecar migration.** Per-sidecar schema migration (the `<sidecar>.migrating` O_EXCL protocol in "What's deferred" → Schema version migration) runs **only after scaffold completeness is confirmed**. Startup order is fixed: (1) check scaffold markers first; (2) only once `_scaffold.complete` is present with `complete.schemaVersion` ≥ current does the server walk sidecars to apply per-file migration. A startup finding `_scaffold.lock` present without `_scaffold.complete` **MUST back off from per-sidecar migration entirely** — the scaffold process may be actively writing sidecars, and concurrent per-sidecar migration would race the scaffold writer. The `schemaVersion` in `_scaffold.complete` is also the **gate** for whether any per-sidecar migration check needs to run: if `complete.schemaVersion` ≥ current, skip the per-sidecar walk; if less, the scaffold re-run path is the entry point for migration, not an independent per-sidecar pass. Per-sidecar `<sidecar>.migrating` locks therefore apply only to narrow incremental field-level transforms applied post-scaffold, not whole-tree schema bumps.
2. **Day 1 (asset auto-discovery):** Each chapter Markdown gets an `asset` record. Each audio render output gets one. Image and music outputs already discoverable from the existing build directories.
3. **Day 2 (event wiring):** The book-server's existing `/api/jobs` queue is updated to emit new events to `events.jsonl` natively going forward. `eventCoverage.jobs` is set to this date. **Backfilling past job records into `events.jsonl` is explicitly deferred** — see "What's deferred." Until B.3 backfill runs, `eventCoverage.jobs` reflects the B.3 go-live date, not the book's creation date.
4. **Day 3+ (workflow):** Tasks, approvals, reviews come online incrementally as the UI surfaces ship.

Existing sidecars (`editorial.json`, `chats/`) stay where they are; the new layout adds alongside them.

## Sequencing relative to the platform spec

Mapping onto the platform-spec's twelve capabilities:

| Capability | Production-graph touchpoint |
|---|---|
| 1. Prose & world editor | Manuscript assets + their versions; literary-device telemetry surfaces as a `measure` job on each manuscript version. |
| 2. Story bible | Each canon entry (character, location, item, rule) is an asset of kind `canon-entry` with relationships `belongs-to: production`, `appears-in: narrative-unit`. |
| 3. Script & dialogue | Screenplay-draft assets + dialogue-only-export jobs. Conflict checks (same-actor-overlap) are validators run as jobs. |
| 4. EPUB & audiobook export | Publish objects of kind `epub` and `audiobook`. Lineage `derived-from` the locked narrative-unit versions. |
| 5. Graphic novel layout | Storyboard-panel assets; comment anchors of kind `panel`; publish object of kind `panel-pdf`. |
| 6. Storyboard & keyframes | Same as #5; the storyboard is a sibling kind of narrative-unit. |
| 7. Animatic & timing | Animatic publish; lineage to dialogue, storyboard panels, music. |
| 8. Visual style / NPR | Style-bible assets (`canon-entry` of kind `style`); referenced by image-generation jobs. |
| 9. Scene graph engine | Implemented BY the production graph itself — the relationship index IS the scene graph. |
| 10. Voice & interaction | Voice-take assets; jobs that route to TTS slot; `routedTo` declares cloud or local. |
| 11. Output / render tools | Publishes + jobs. The dashboard's "recent publishes" + "exception conditions" pull from here. |
| 12. Integration & API layer | Plugin manifests + service slots already shipped; the graph just refers to them via the `routedTo` field on jobs. |

## What's deferred (explicit)

These are **load-bearing but not v1**. The model accommodates them; the implementation phases them in.

| Deferred capability | Why deferred | Where it lands in the model when ready |
|---|---|---|
| Multi-production registry | Single book today; multi-production is a future need. | New `galley:registry:productions.json` at the user-level (not per-book). |
| Cross-device participant directory | Sunfish kernel-sync isn't wired yet. | Participant records sync via kernel-sync once wired; the `deviceKeys[]` field activates. |
| Restricted-share watermarking | No public-facing share flows ship today. | Implementation lives in export pipeline; surfaces in publish records when added. |
| CRDT-merged sidecars | Single-writer per device today. | Sidecars become CRDT documents (per Sunfish kernel-crdt) when concurrent multi-device editing matters. |
| Schema validation at write time | v1 trusts authoring tools to emit correct shapes. | JSON Schemas land in `packages/plugins/schemas/` and book-server validates on PUT. |
| Backfilled events | No event log today. | Migration script reads existing job records and emits synthetic past events. |
| Schema version migration | All files are `schemaVersion: 1`; no migration needed yet. | On startup, galley reads each sidecar, checks `schemaVersion`, and applies the appropriate idempotent transform. Transforms are defined in `packages/plugins/schemas/migrations/v<N>-to-v<N+1>.json` when they land. Concurrent startup safety: each migrated file uses a `<sidecar>.migrating` lock file (O_EXCL create) during the write window; a process that finds the lock file already present skips migration for that file and retries on the next read. |

## Implementation phases (post-spec)

| Phase | Scope | Visible result |
|---|---|---|
| **B.1 — Scaffold + read-only** | Auto-create production + narrative-unit + asset records on first book-open. Index rebuilds. Read-only API: `GET /api/productions/:id/graph`. | Dashboard can read real data. |
| **B.2 — Tasks + approvals + comments** | Write paths land. Task / approval / comment editors in the UI. | Workspace view becomes usable. |
| **B.3 — Job events** | Every job (measure, render, export) emits events. The existing `/api/jobs` queue surfaces as events. | Automation Jobs surface populated. |
| **B.4 — Compare view** | Version-compare UI per medium. Diff renderers. | Reviews surface gets compare-first workflow. |
| **B.5 — Lineage graph** | Dependency / lineage visualisation. Filterable by kind / state / participant. | Asset view gets the "what does this affect" pivot. |
| **B.6 — Audit + export** | Audit-log export. Publish-record drill-down. Watermarking spec lands. | Governance loop complete. |

**Phase A ships simultaneously with B.1, not before it.** The Dashboard is the centrepiece of the Phase A IA shift; it requires `production.json` + narrative-unit data from B.1 to show anything meaningful. Shipping Phase A before B.1 is complete would mean every Dashboard panel is a stub — pure theatre. The gate is: B.1 scaffold + read-only API (`GET /api/productions/:id/graph`) merged and tested → Phase A IA ships in the same release cut.

## Open design questions (for next iteration)

- **Storyboard-panel asset granularity.** One asset per panel, or one asset per storyboard section with panels as sub-records? Per-panel is closer to MovieLabs OMC; per-section is lighter. Defer until storyboard work scopes.
- **Cross-production assets.** When a character bible spans two books (a series), do assets live in the production root or float at the user-level? Defer until the second book in a series ships.
- **Job retention.** Job records can grow unbounded over months. Auto-archive policy or just leave them on disk? Suggest: keep all, surface only last 30 days by default.
- **Comment threading depth.** Linear (one parent), full tree (n-level)? Lean linear; matches review-workflow norms.
- **Approval delegation.** Can a reviewer delegate to another participant? Defer; explicit task reassignment covers it.

## Cross-references

- `docs/architecture/galley-platform-spec.md` — twelve-capability scope + auth/2FA model.
- `docs/architecture/plugin-architecture.md` — plugin manifest schema, slot routing.
- `docs/architecture/galley-as-sunfish-accelerator.md` — Sunfish kernel integration path (kernel-sync + kernel-crdt + kernel-security).
- `docs/AUDIO-EDITOR-SPEC.md` — audio chunk + alignment model (existing prior art for the asset.versions[] approach in audio).
- MovieLabs *Ontology for Media Creation, Part 3: Assets* v2.6 — vocabulary anchor.
- MovieLabs *Software-Defined Workflows* — workflow-visibility principle anchor.

## Acceptance for this spec (CO sign-off needed)

- [ ] Object inventory + sidecar layout approved
- [ ] Relationship vocabulary approved (7 verbs; reviewer captured via approval objects)
- [ ] Event-log model approved
- [ ] Migration path approved
- [ ] Sequencing (A + B.1 simultaneous → B.6) approved
- [ ] Open design questions triaged

Once signed off, Phase A (IA shift on the home page) and B.1 (scaffold + read-only API) land together as a single release. Phase A is blocked until B.1 is code-complete; the Dashboard must display real `production.json` + narrative-unit data, not stubs.

---

## Council amendments log (2026-05-15)

UPF analysis identified six specification gaps; a council of experts resolved each. Changes applied in this revision:

| Gap | Council finding | Resolution |
|---|---|---|
| **G1 — `reviewed-by` redundancy** | Two canonical sources for reviewer relationships would diverge. Approval objects already carry `reviewer` as a first-class field; adding a parallel `refs["reviewed-by"]` creates a maintenance trap. | Removed `reviewed-by` from the `refs` vocabulary. Approval sidecars are the single canonical reviewer record. `refs` now has 7 verbs, not 8. |
| **G2 — Index rebuild trigger vague** | "On demand" is not implementable. Rebuild timing must be a contract, not a hint, or callers cannot reason about freshness. | Defined three concrete triggers: (1) startup when `_index/` is absent or stale, (2) any sidecar write (synchronous before response), (3) explicit `DELETE /api/productions/:id/index`. Added `_index/meta.json` with `lastBuilt` for staleness detection. |
| **G3 — Phase A before B.1** | Dashboard is the centrepiece of Phase A; without real `production.json` data it is pure stub theatre. Shipping Phase A first creates an obligatory regression (replace stubs with real data) rather than a clean landing. | Phase A ships simultaneously with B.1 in a single release cut. B.1 scaffold + read-only API is the gate. |
| **G4 — Git vs. cache versioning undocumented** | Two backends exist behind the same `versions[]` abstraction. Undocumented mutual exclusivity means implementors may try to mix them, leading to data duplication or divergence. | Added `production.versioningBackend: "git" \| "cache"` field. Clarified the Prose row in the Compare-first table: git-repo books use git; non-git books use `_cache/`; never both. |
| **G5 — `eventCoverage` missing** | Without a coverage marker, operators who try to rebuild state from `events.jsonl` will hit a silent floor — events only start at B.3; sidecars carry pre-B.3 history. Missing marker = debugging trap. | Added `production.eventCoverage: { from, note }` to record the ISO date from which events are present and a human-readable note about the coverage boundary. |
| **G6 — Book-root `belongs-to` chain** | The Productions surface's narrative-unit count query walks from `production:root` downward. If the book-root narrative-unit doesn't anchor to `production:root` via `belongs-to`, the graph is disconnected at the top and the count query returns 0. | Required invariant: book-root narrative-unit always carries `refs["belongs-to"]: ["galley:<production>:production:root"]`. Auto-set by B.1 scaffolding. Documented in the Narrative unit section. |

### Second council pass (2026-05-15) — N1–N10

| Gap | Council finding | Resolution |
|---|---|---|
| **N1 — Index rebuild synchronous** | G2's fix introduced a worse problem: rebuilding all sidecars synchronously on every PUT would cause hundreds of file reads per auto-save in any non-trivial book. | Replaced synchronous-on-write with dirty-flag + lazy-on-read model. Writes mark `meta.json { dirty: true }`; reads trigger rebuild if dirty. Added in-process cache invalidation requirement via mtime watch. |
| **N2 — `participants.json` flat file** | Every other object uses per-file sidecars. A single flat array for all participants prevents independent CRDT merge and is inconsistent with the sidecar pattern. | Per-participant files: `participants/<id>.json`. B.1 auto-migrates legacy flat file. Layout updated in object inventory table and sidecar tree. |
| **N3 — `versioningBackend` detection undefined** | Field exists but spec didn't say who sets it or what happens when declared backend is absent at runtime. Undefined behavior at scaffold and on filesystem change. | B.1 scaffolding auto-detects: `.git` present → `"git"`, else → `"cache"`. Runtime fallback: `"git"` with no `.git` → degrade to `"cache"`, emit `verb: "warn"` event, surface in Dashboard exception conditions. |
| **N4 — `approval.state` missing `"withdrawn"`** | No retraction path for an in-flight approval submitted in error. Workflow dead-end; model becomes inconsistent. | Added `"withdrawn"` as terminal state reachable only from `"pending"` or `"needs-changes"`. Decided approvals are immutable. Added `withdrawnAt/By/Note` optional fields. |
| **N5 — `job.outputs[]` typed as galley IDs only** | Build artifacts (TTS chunks, thumbnails, measurement intermediates) are job outputs but not galley assets; they had nowhere to land. | `outputs[]` accepts `"galley:<id>"` (registered asset) and `"path:<relative>"` (build artifact). Added verb→output-type table defining which verbs produce assets vs. artifacts. |
| **N6 — `anchor.spec` format undefined** | Open `"..."` string means two implementations produce incompatible anchor formats; search and compare silently break across implementations. | Defined canonical format per `kind`: `passage` 0-indexed LSP-compatible line/col; `frame` 0-indexed integers; `timecode` SRT-compatible; `panel` short-id; `page` 1-indexed page + normalised rect. Non-conforming specs stored but not indexed. |
| **N7 — `publish` missing `subjectVersion`** | Can publish an unapproved version without detectable inconsistency; approval coverage is unverifiable from the publish record alone. | Added `subjectVersion` to publish shape. B.2 write path enforces that `approvedBy` references must have matching `subjectVersion`. |
| **N8 — `eventCoverage.from` single timestamp** | Different phases (B.1/B.2/B.3) populate events at different times. A single timestamp overstates or understates coverage depending on which phase the caller cares about. | Replaced scalar `from` with phase map `{ scaffold, workflow, jobs }` (each null until the phase runs). Added `completeSince` convenience field (max of all non-null values; null until complete). |
| **N9 — `asset.kind` enum incomplete** | `canon-entry`, `style`, and `measurement` referenced in sequencing section but absent from the kind discriminator. Schema validation would reject story-bible and measurement assets on day one. | Added `"canon-entry"`, `"style"`, `"measurement"` to the asset kind enum. |
| **N10 — Migration Day 2 contradicts deferred table** | Migration section said "translate existing job records → events" on Day 2; deferred table said "backfilled events — deferred." Both cannot be true; implementor confusion guaranteed. | Day 2 now wires NEW jobs to emit events going forward (forward-event-wiring). Backfilling past records explicitly deferred to post-B.3. `eventCoverage.jobs` reflects B.3 go-live date. |

### Third council pass (2026-05-15) — P1–P8 + sub-gaps

| Gap | Council finding | Resolution |
|---|---|---|
| **P1 — `visibility`/`accessControl` missing from asset shape** | Security-critical fields documented only in Security-section prose; an implementor reading only the per-kind shapes builds a system with no access control. | Added `visibility` and `accessControl` to asset JSON shape. Defaults: `visibility: "production"`, `accessControl: { allow: [] }`. B.1 scaffold writes these defaults on every auto-created asset. |
| **P2 — `event.verb` undefined** | Dashboard query ("everything in motion or blocked") filters on event verbs. Without an enumerated vocabulary the Dashboard is unimplementable from the spec. | Defined 21-verb canonical vocabulary grouped by phase. Added `state-change` with `previousState` + `context` fields (adversarial finding: cross-subject lookup needs context pointer). Defined five Dashboard query contracts explicitly. |
| **P3 — `comment.thread` ambiguous** | "thread" could mean parent, root, or next-in-thread — three different topologies. Ambiguity guaranteed divergent implementations. | Renamed to `replyTo`; defined as direct parent comment ID or `null` for root comments. Depth bounded at 2 levels in v1. Index computes reply lists from `replyTo`. |
| **P4 — Approval state machine missing** | Five states, no transition table, `decidedAt` shown as always non-null but must be null for `withdrawn`. | Added formal 9-row transition table. Clarified: `decidedAt` is `null` when state is `pending` or `withdrawn`. `withdrawnAt` is set on `withdrawn`. |
| **P5 — `task.subject` single-object undocumented** | Single-subject is a design constraint that would surprise B.2 implementors building multi-asset workflows. | Documented the design intent and the correct alternative: use an `approval` on the parent narrative unit for multi-asset sign-off; link sibling tasks via `refs["depends-on"]`. |
| **P6 — `sourcePath` relativity unstated** | No statement of whether paths are relative or absolute. Moving the book silently breaks all asset references if absolute paths are used. | Declared canonical rule: all path fields relative to `bookRoot`. Added to asset prose and sidecar layout section. Covers `asset.sourcePath`, `publish.outputPath`, `"path:"` job outputs (resolves P5a). |
| **P7 — Job-to-publish lifecycle undefined** | Unclear who creates the publish record, when, and how fields map from job. Offline (Tauri) scenario had no reconciliation path. | Defined: job worker creates publish record on success; `completedAt` copied from job. Added startup reconciliation scan for orphaned succeeded publish-jobs. |
| **P8 — `schemaVersion` no migration contract** | Files carry `schemaVersion: 1` with no defined upgrade path; concurrent migration race possible with multi-process starts. | Added migration policy to deferred table: idempotent transforms in `migrations/v<N>-to-v<N+1>.json`; O_EXCL lock file prevents concurrent write corruption (adversarial finding). |
| **P1a — Startup O(n) sidecar scan** | Checking staleness by scanning all sidecar mtimes is O(n) per startup for large books. | `meta.json` stores `maxSidecarMtime` high-water mark; startup staleness check is O(1). |
| **P2a — `participants.json` fan-out absent from Day 1** | Migration step didn't mention legacy flat-file fan-out, leaving implementors to discover it at runtime. | Added to Day 1 scaffold: fan-out + `.bak` rename with one-release retention. |
| **P3a — `versioningBackend` detection block misplaced** | Detection logic was after the phases table; implementors reading the Production shape wouldn't see it. | Moved detection block to immediately after the Production JSON shape. Added `git ls-files` check before `git log --follow` (adversarial: symlink / untracked path silent failure). |
| **P4a — `decidedAt` non-null in withdrawn example** | Resolved by P4 state machine fix above. | — |
| **P5a — `"path:"` relativity unstated** | Resolved by P6 path relativity rule above. | — |

### Fourth council pass (2026-05-15) — Q1–Q10

| Gap | Council finding | Resolution |
|---|---|---|
| **Q1 — Production-ID formation undefined** | `production-id` was implied to derive from the mutable title; changing the book name would silently break every cross-reference in every sidecar file. | Defined: production-id is an immutable slug derived once at scaffold time from the initial title (lowercase, non-alphanumeric → `-`, max 48 chars). Never changed after creation; title changes do not propagate. Collision resolved by user-appended suffix at creation time. |
| **Q2 — Task `verb: "approve"` vs `approval` object handoff** | Both objects represent approval intent; completing an approve task may or may not auto-create an approval — undefined and therefore inconsistent across implementations. | Defined: approve-task is an assignment record only. Task completion does NOT auto-create an approval. The reviewer creates the approval directly; after the approval is submitted, the system sets the originating task to `done` with `context` pointing at the approval. Tasks and approvals remain separate sidecar objects linked only through that event. |
| **Q3 — Narrative-unit status transitions undefined** | Five statuses defined; no trigger table. Dashboard `state-change` queries depend on knowing what drives transitions; implementations vary without a rule. | Added formal trigger table: 7 transitions driven by task completions or approval decisions. `locked` is terminal. `approved → review` path added for approval withdrawal. All unlisted transitions rejected by the writer. |
| **Q4 — Deletion semantics absent** | No protocol defined; three incompatible implementation choices (hard delete, soft delete, ref-integrity). Dangling refs and audit log consistency unspecified. | Defined soft-delete only for v1: `deletedAt` + `deletedBy` fields added to sidecar; file retained; index excludes but tracks; `verb: "deleted"` event emitted; dangling refs are `warn` conditions, not errors. Hard delete not supported. |
| **Q5 — `event.by` for system events** | System events (`scaffold`, `migrate`, `index-rebuilt`, `warn`) have no valid participant ID for the `by` field; implementations would use inconsistent sentinels. | Reserved sentinel `"galley:system"` defined for all system-generated events. Not a participant object; no sidecar file. No other sentinel values (`null`, empty string) are valid. |
| **Q6 — `comment.subjectVersion` required vs optional** | Shape showed non-null value; comments during active drafting (before any version exists) have no valid version to pin. | Declared `subjectVersion: string | null`. Null = not pinned to a specific version; non-null = pinned for formal review. Implementations must accept null on write; omitting is normalized to null on read. |
| **Q7 — `asset.checksum` top-level vs versions** | Top-level `checksum` and per-version `checksum` were both defined without a stated relationship; divergence inevitable. | Removed top-level `checksum` field. Canonical current checksum is always `versions[versions.length-1].checksum`. Writers append new version entries; readers derive current checksum from the last entry. |
| **Q8 — `page` anchor 1-indexed inconsistency** | All other anchor kinds are 0-indexed; `page` was 1-indexed without explanation; off-by-one bugs in code that normalizes across kinds. | Kept `page` 1-indexed (matches human-visible PDF page numbers); added explicit note: display layer does NOT add 1 to page numbers. General note added: all kinds except `page` are 0-indexed internally. |
| **Q9 — `tags` model undefined** | Tags appeared in common fields but type, validation, indexing, and mutation semantics were all undefined. | Defined: free-form UTF-8, lowercase-hyphenated, max 64 chars each, max 32 per object. Not a controlled vocabulary. No dedicated tag index; consumers scan sidecar files for tag queries. Tag changes emit a normal `update` event. |
| **Q10 — `job.inputs` schema undefined** | Freeform object with no interoperability contract across plugins. | Defined: inputs are verb-scoped; each plugin declares its schema in its plugin manifest; built-in verbs declare schemas in `galley-core/src/verb-schemas.ts`. Unknown verbs rejected at enqueue. New optional fields carry defaults in the schema for forward compatibility. |

### Fifth council pass (2026-05-15) — R1–R6

| Gap | Council finding | Resolution |
|---|---|---|
| **R1 — Task state machine undefined** | Five task states defined; no transition table despite repeated references to task completion driving narrative-unit state changes and the Dashboard "blocked" query depending on task state. Implementors would diverge on who can block/unblock/cancel a task and when `done` is set. | Added formal 11-row transition table. `done` and `cancelled` are terminal. System-driven `blocked` propagation fires when all tasks in `refs["depends-on"]` are `blocked`/`cancelled`; unblock fires when any dependency exits that state. Every transition emits a `state-change` event with `previousState` + `context`. |
| **R2 — `approval.subjectVersion` for narrative-unit subjects** | Approval shape showed `subjectVersion: "v0007"` (a version string), but approvals can be applied to narrative-units, which have no `versions[]` array — the version concept is undefined for that subject type. | Declared `subjectVersion: string \| null`. Asset approvals SHOULD set it to the specific version being approved. Narrative-unit approvals MUST set it to `null` — NUs have no versioned snapshots; the approval covers current composite state. Reverse pairings accepted but emit `warn`. |
| **R3 — `approvedBy: []` (unapproved publish) semantics** | Spec stated the `subjectVersion` coverage check only when `approvedBy` was non-empty, but said nothing about the empty case — the most common early-phase scenario. Policy undefined. | Clarified: `approvedBy` defaults to `[]`; empty = unapproved publish; permitted for previews/drafts. Coverage check fires only when non-empty. A finished-deliverable `kind` (`epub`, `audiobook`) with `status ∈ {approved, locked}` and empty `approvedBy` emits `warn` + Dashboard exception — observable governance, not enforcement gate. |
| **R4 — Ref cycle detection undefined** | Directional edges in `refs` with no policy on cycles. `depends-on` cycle = both tasks forever blocked. `supersedes` cycle = lineage reconstruction impossible. Two implementations would diverge: one rejecting at write time, one accepting silently. | `depends-on` / `blocks` cycles detected by index DFS, surfaced as `warn` events listing cycle members; write NOT rejected (provisional cycles legitimate during in-flight work). `supersedes` cycles rejected at write time (lineage invariant). `belongs-to` cycles rejected by hierarchy invariant. Remaining verbs need no cycle check. |
| **R5 — Narrative-unit `sourcePath` vs asset `sourcePath` dual authority** | Both manuscript asset and its parent narrative-unit carry `sourcePath` pointing at the same file. A rename updating only one leaves the graph silently inconsistent; spec did not state which is authoritative. | Asset's `sourcePath` is authoritative for content access. Narrative-unit's `sourcePath` is a denormalised convenience field; write path updates both atomically — two `update` events (one per sidecar) written in a single `write(fd, buf)` syscall to events.jsonl, sharing a `"sourcePath sync — <old> → <new>"` summary prefix. NUs `sourcePath` cannot be mutated independently — rejected at write time. Coupling applies only to `kind: "manuscript"` assets with a narrative-unit parent. |
| **R6 — B.1 partial scaffold recovery** | A B.1 scaffold interrupted mid-way (power loss, kill, disk full) leaves a partially-built `.galley/`. The dirty-flag index check only detects index staleness, not scaffold incompleteness; next startup had no defined recovery path. | Added marker pair: `_scaffold.lock` (O_EXCL at start) → atomic rename to `_scaffold.complete` (with `schemaVersion`) on success. Startup checks both: lock-without-complete → re-run scaffold (idempotent no-op merges); complete-with-stale-schema → re-run for migration; neither → first scaffold. Same routine handles first open, crash recovery, and schema bump. |

### Sixth council pass (2026-05-15) — S1–S4

| Gap | Council finding | Resolution |
|---|---|---|
| **S1 — `publish.subjectVersion` on narrative-unit subject** | The publish shape shows `subjectVersion: "v0003"` with `subject` pointing at a narrative-unit. Council pass 5 (R2) defined `approval.subjectVersion` as null when subject is a NU — but `publish.subjectVersion` has different semantics and the spec was silent. | Clarified: `publish.subjectVersion` is the publish artifact's own iteration identifier set by the publishing plugin (not a reference into asset `versions[]`); always non-null regardless of subject kind. The approval-coverage check works because the reviewer pins the same version label pre-publish; the NU carries no `versions[]` but the label convention is shared. |
| **S2 — Atomic dual-write event structure** | R5 fix said "single `update` event covering both files" for the manuscript asset + narrative-unit `sourcePath` sync write. The event schema has one `subject` field — "single event, two files" is a contradiction. | Replaced with two `update` events (one per sidecar, one per subject) written atomically to `events.jsonl` in a single `write(fd, buf)` syscall, sharing a `"sourcePath sync — <old> → <new>"` summary prefix. R5 ledger row updated to match. |
| **S3 — `participant.role` single-role constraint undocumented** | A self-published audiobook author who also narrates cannot be modelled under a single role field. The constraint was implicit; no documentation or upgrade path. | Documented as intentional v1 simplification. Role affects UI filtering/task routing, not hard capability enforcement. Multi-role (`roles: string[]`) deferred to post-v1 with a no-schema-bump forward-compat path. |
| **S4 — Two lock protocols without interaction rules** | Per-sidecar `<sidecar>.migrating` locks (P8 resolution) and the scaffold marker pair (R6 resolution) both use O_EXCL and can both be triggered at startup, but no order-of-operations was defined. A startup hitting both had a potential data race. | Defined startup order: scaffold completeness confirmed first; per-sidecar migration runs only after `_scaffold.complete` is present with `schemaVersion` ≥ current. A startup finding `_scaffold.lock` without `_scaffold.complete` backs off from per-sidecar migration entirely. `_scaffold.complete.schemaVersion` is the gate for whether per-sidecar migration runs at all. |


### Seventh council pass (2026-05-15) — T1–T3

| Gap | Council finding | Resolution |
|---|---|---|
| **T1 — `production.activeVoice` undefined** | Field appeared in the production JSON shape as `"activeVoice": "anna"` with no type, valid values, or semantics defined anywhere in the spec. | Defined: `activeVoice` is a plugin-manifest voice slot label (not a participant reference, not a raw model ID). The manifest resolves the slot to the underlying model. Default `"default"`. Falls back from job-level `inputs.voice` to `activeVoice` to manifest default. Updated via normal `update` event. |
| **T2 — Narrative-unit kind hierarchy constraints undefined** | Six kinds defined; valid parent-child pairs left unconstrained. Unclear whether a `scene` can be a direct child of `book`, or whether `storyboard-section` can parent a `chapter`. Different production types use different hierarchies. | Defined kind-agnostic hierarchy policy: two enforced rules only — (1) `kind: "book"` anchors to `production:root`, may not have a narrative-unit parent; (2) `belongs-to` DAG is acyclic (covered by cycle policy). All other kind combinations permitted. Canonical enumeration order is the B.1 generator default, not a constraint. |
| **T3 — `task.dueAt` overdue behavior absent** | Five Dashboard query contracts defined; none covered overdue tasks. `dueAt` field had no observable behavior beyond storage. | Added "Overdue" as sixth Dashboard query contract: `state ∈ {open, in-progress, blocked}` AND `dueAt < now`, computed at read time — no event emitted, no state auto-transition. Acting on overdue = explicit user cancel or `dueAt` update. |

### Eighth council pass (2026-05-15) — U1–U3

| Gap | Council finding | Resolution |
|---|---|---|
| **U1 — `events.jsonl` single-writer contract** | S2 fix used `write(fd, buf)` atomic syscall, implying single-writer, but never stated. A Tauri offline shell + book-server could both write to `events.jsonl` concurrently, corrupting JSONL format. | Defined single-writer contract: only book-server appends to `events.jsonl`. Tauri offline shell writes to `_offline-events.jsonl` write-ahead buffer; book-server drains on reconnect (timestamp order). Defers true multi-process concurrent event authoring to kernel-sync CRDT phase (post-v1). |
| **U2 — `comment.resolved` revocation** | `resolve` event verb existed; no statement on whether `true → false` transition was permitted. Boolean field with no terminal-state contract. | Declared `resolved: true` as a one-way write — writers MUST reject `true → false` at sidecar-write time. No `unresolve` verb. Re-opening a resolved issue = new comment or reply with `replyTo` pointing at resolved comment. |
| **U3 — `asset.versions[].v` format** | Examples showed `"v0001"` but format was never defined. Cross-tool interop and approval-coverage check both depend on string equality that is only sound when all writers conform to the same format. | Defined canonical format: `^v\d{4}$`, strict monotonicity, lexicographic = numeric order. Non-conforming values warn-not-reject. Cap `"v9999"` per asset (format safety bound). |
