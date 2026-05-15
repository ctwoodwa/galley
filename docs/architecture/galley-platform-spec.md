# Galley platform spec — local-first editorial production

**Status:** Authoritative scope document.
**Audience:** Maintainers, contributors, plugin authors.
**Companion docs:** [`galley-as-sunfish-accelerator.md`](galley-as-sunfish-accelerator.md) (positioning), [`plugin-architecture.md`](plugin-architecture.md) (extension model), [`../AUDIO-EDITOR-SPEC.md`](../AUDIO-EDITOR-SPEC.md) (audio-first prose editor).

## TL;DR

Galley is a **local-first, self-hosted editorial production platform**
for prose, screenplay, audiobook, graphic-novel, and animatic work.
Every capability has a local implementation. External APIs are
**optional plugins** that the user opts into per slot; nothing
silently routes work to the cloud, and nothing requires a vendor
account to use.

The full scope of the platform is twelve capability areas, listed
below. Each area carries the same contract:

1. A local-first default — the work runs against on-device or
   user-controlled hosts, with state on the user's filesystem.
2. An explicit, per-capability plugin slot where the user can swap
   in a cloud service (Anthropic, OpenAI, Google, Stability, etc.)
   if they want one and have a key. The slot is empty by default.
3. State is the user's. Sidecar files live under `<bookRoot>/.galley/`
   and never leave the device unless the user wires sync.

## Non-negotiables

| Principle | Concrete commitment |
|---|---|
| **Local-first** | Every shipping feature has a local-first path. Cloud is opt-in per slot, never the default. |
| **Self-hostable** | All workers (TTS, STT, image, music, LLM) have a local-runnable counterpart documented in `packages/plugins/plugins/`. |
| **No silent cloud calls** | Outbound network calls only fire when the user has configured a cloud slot. The UI surfaces which slots are routing where. |
| **User-owned state** | Books, chapters, profile, history, comments, render outputs, voice samples — all live on the user's filesystem. Sync (when added) is between user-owned devices via Tailscale or Sunfish kernel-sync. |
| **No telemetry phone-home** | Galley does not emit application telemetry. The only "telemetry" in galley is the literary-device pipeline, which runs locally on the user's manuscript. |
| **License clarity** | MIT, repo-wide. Plugins declare their own licenses in their manifests. |

## Status legend

For the capability tables below:

- **Shipped** — works in main today; tested, documented.
- **In progress** — partial implementation, behind a setting or scoped to one path.
- **Planned** — committed scope; design exists, code does not.
- **Reserved** — placeholder. Scope acknowledged, design TBD.

## Capability map

The twelve capability areas. Each section below covers what the area
does, what's local-first about it, what optional cloud integrations
exist, and the current build status.

| # | Area | Status (overall) |
|---|---|---|
| 1 | Prose & world editor | In progress |
| 2 | Story bible & metadata | Planned |
| 3 | Script & dialogue tooling | Reserved |
| 4 | EPUB & audiobook export | In progress |
| 5 | Graphic novel layout engine | Reserved |
| 6 | Storyboard & keyframe tools | Reserved |
| 7 | Animatic & timing tools | Reserved |
| 8 | Visual style & NPR tooling | Reserved |
| 9 | Scene graph / shot graph engine | Reserved |
| 10 | Voice & interaction layer | In progress |
| 11 | Output / render tools | In progress |
| 12 | Integration & API layer | Shipped (plugin substrate); In progress (DCC bridges) |

---

## 1. Prose & world editor

**Local-first contract:** Manuscript prose lives in the user's book
repository as plain Markdown files. The editor reads them directly;
no DB indirection. Edits land back on disk via the book-server
filesystem API.

| Feature | Status | Notes |
|---|---|---|
| Rich-text editor for manuscript & scene prose | In progress | Reader surface ships; audio-first editing flow specced in `AUDIO-EDITOR-SPEC.md`. Rich-text controls (bold/italic/quote) sit behind the prose surface. |
| Structured scene cards (title, beats, duration, tags) | Planned | Scene metadata stays in YAML frontmatter or sidecar JSON; no DB. |
| Literary-device telemetry metrics | Shipped | 78 detectors in `prose_telemetry/dispatch.run_registry`. Verdict + blockers + warnings + per-detector findings. Surfaced via `/api/books/:bookId/measure` and the left-docked telemetry panel. |
| Character sheets (bio, design notes, relationships, arcs) | Planned | Sheets stored as Markdown + frontmatter under `<bookRoot>/cast/`. Editor view + link-back to scene appearances. |
| Location / prop sheets (description, mood, time of day) | Planned | Same shape as character sheets, under `<bookRoot>/places/` and `<bookRoot>/props/`. |

**Optional cloud:** The editorial chat (`apps/web/src/features/chat`)
can call out to Anthropic Claude / OpenAI GPT / Google Gemini for
copy-edit suggestions, but only when the user has configured the
`llm` capability slot. No call is made before the user clicks Send.

---

## 2. Story bible & metadata system

**Local-first contract:** All canon lives on disk as structured
files. Galley reads and writes them; the user can edit them in any
text editor. Indexing is rebuilt locally on demand.

| Feature | Status | Notes |
|---|---|---|
| Central database for characters, locations, items, rules | Planned | SQLite over the on-disk YAML/Markdown tree. The DB is a derived cache; the tree is authoritative. |
| Continuity tracking (who/what/where per scene) | Partial | `story_canon/` library (sibling to `prose_telemetry`) provides validators for dates, durations, ages, relationships. Wired through the same pipeline. Scene-level appearance index is planned. |
| Tagging & search across scenes, characters, motifs | Planned | Tantivy or SQLite FTS5 index over the book tree. Fully local. |
| Versioning for scenes & story-wide changes | Partial | Git is the long-term substrate (every book is a git repo). Galley adds a per-edit undo stack on top, and (later) Sunfish CRDT documents for live multi-device editing. |

**Optional cloud:** None. The bible never leaves the user's device.

---

## 3. Script & dialogue tooling

**Local-first contract:** Screenplay / animation script output is
generated from the manuscript's scene structure. Templates live in
the user's repo so the format is forkable.

| Feature | Status | Notes |
|---|---|---|
| Screenplay / animation script formatting | Reserved | Likely Fountain-format intermediate, with templated renderers for Final Draft (.fdx) and PDF. |
| Dialogue-only export with speaker labels | Reserved | Speaker labels derive from canon. Output is plain text or JSON for downstream audiobook pipelines. |
| Beat timing / pause annotations | Reserved | Hooks into the audio chunk model already used by audiobook rendering. |
| Conflict checks (same actor in overlapping scenes) | Reserved | Story-canon validator family — same pattern as continuity tracking. |

**Optional cloud:** None for export. The chat could draft scene
descriptions, but that's the same opt-in `llm` slot as area 1.

---

## 4. EPUB & audiobook export tools

**Local-first contract:** Final assembly runs against the local book
tree, with optional routing to a user-controlled GPU host for
expensive synthesis. Output files land in the user's project tree.

| Feature | Status | Notes |
|---|---|---|
| EPUB export from structured manuscript | Planned | TOC + frontmatter + chapters + cover, generated locally. The Inverted Stack build pipeline already exists in the user's book repo; galley imports/wraps it. |
| Audio script export (narration + character lines) | Planned | Render the dialogue-only export (area 3) plus narration into chapter-scoped scripts ready for TTS. |
| Integration with TTS / voice engines or DAWs | Shipped (TTS); Planned (DAW) | TTS routes through the `tts/fast` and `tts/quality` capability slots. Default workers: **Kokoro-FastAPI** (fast) and **higgs-audio** (quality) — both self-hosted. DAW handoff is BWF/Reaper-project export, planned. |

**Optional cloud:** ElevenLabs, OpenAI Speech via the `tts/quality`
slot. User pastes API key in Settings → Services. Cloud is off by
default; local Kokoro/higgs-audio is the install-time path.

---

## 5. Graphic novel layout engine

**Local-first contract:** Page and panel definitions are JSON on
disk. Rendering produces local image files. No layout state lives
in a remote service.

| Feature | Status | Notes |
|---|---|---|
| Panel-grid templates and freeform layouts | Reserved | Template library shipped with galley; users can fork and version per book. |
| Mapping scenes/beats to pages and panels | Reserved | Each panel references a `(chapter, beat)` tuple; many-to-many. |
| Panel-level metadata (shot type, angle, focus character) | Reserved | Same metadata vocabulary as the scene-graph engine (area 9) so storyboard work feeds layout work. |
| Balloon / lettering placement tools | Reserved | Vector overlay on rasterized panels; balloons reference canon dialogue so a copy edit propagates. |

**Optional cloud:** None for layout. Image fills route through area
8 (visual style) which may use cloud image models.

---

## 6. Storyboard & keyframe tools

**Local-first contract:** Thumbnail sketches and shot lists live in
the book tree under `<bookRoot>/boards/`. Image generation can run
on a local GPU (ComfyUI / SDNext / Fooocus) or via cloud plugins
when the user enables them.

| Feature | Status | Notes |
|---|---|---|
| Thumbnail sketch panels (manual or AI-assisted) | Reserved | Manual = bring-your-own-PNG. AI-assisted routes through the `image` capability slot. |
| Shot list editor (camera, movement, framing) | Reserved | Shot rows reference panel rows in area 5 and scene rows in area 1. |
| Pose / expression selectors linked to character sheets | Reserved | Pose library is a local asset pack; per-character overrides under `<bookRoot>/cast/`. |
| Sequence timelines for boards and scenes | Reserved | Same timeline component as area 7. |

**Optional cloud:** Image generation can route through cloud plugins
when the local GPU isn't enough — DALL·E 3, Stability AI, FLUX BFL,
Google Imagen, Replicate (all already in the plugin registry).
Default is local ComfyUI.

---

## 7. Animatic & timing tools

**Local-first contract:** Animatic projects assemble locally from
boards (area 6) and audio (area 4). Renders write to local disk.

| Feature | Status | Notes |
|---|---|---|
| Timeline editor with panels, audio, camera notes | Reserved | Tracks: panels, dialogue, narration, music, camera/transition notes. |
| Scratch audio import or TTS for dialogue / narration | Reserved | Scratch = imported file. TTS = routed through `tts/fast` for quick previews. |
| Basic camera moves and transitions between panels | Reserved | Pan, push-in, dissolve, cut. Stored declaratively so they replay deterministically. |
| Low-fidelity render / export of animatics | Reserved | ffmpeg-driven; produces MP4 or PNG sequence. |

**Optional cloud:** None planned. Animatic compute is light enough
that local rendering is the right answer.

---

## 8. Visual style & NPR tooling

**Local-first contract:** Style bibles are versioned alongside the
book. NPR rendering uses local image models or local engine
shaders.

| Feature | Status | Notes |
|---|---|---|
| Style bibles for line, color, shading, FX | Reserved | A style bible is a `<bookRoot>/style/*.yaml` set referenced by panels and shots. |
| Toon / anime presets (line weight, tone, halftone) | Reserved | Preset packs ship with galley; users add custom packs. |
| Model / style library for different looks | Reserved | LoRAs, ControlNets, prompt fragments — all local files referenced by ID. |
| Hooks for engine-based NPR (toon shaders) or image models | Reserved | Hook points for Godot / Blender / Unreal NPR pipelines (area 12). |

**Optional cloud:** Image models from area 6 are reused here. Style
training (fine-tuning a LoRA) stays local — galley is not in the
training-orchestration business unless the user wires a local
training script.

---

## 9. Scene graph / shot graph engine

**Local-first contract:** The graph is a JSON document under the
book root. It links scenes (area 1) ↔ panels (area 5) ↔ shots
(area 6) ↔ animatic clips (area 7).

| Feature | Status | Notes |
|---|---|---|
| Logical representation of scenes, shots, panels | Reserved | DAG with typed edges; queryable by canon fields (character, location, time-of-day). |
| Camera path & framing per shot | Reserved | Stored as keyframe records, replay-deterministic. |
| Links between 2D panels, 2.5D layouts, potential 3D scenes | Reserved | Same node identity across dimensionalities; 2.5D + 3D are progressive renders. |
| Continuity constraints (costume, props, lighting) | Reserved | Soft constraints; violations surface as warnings in the same place telemetry warnings do today. |

**Optional cloud:** None. The graph is canon; it never leaves disk.

---

## 10. Voice & interaction layer

**Local-first contract:** STT runs against the user's `stt/fast` or
`stt/quality` slot — defaulting to local Faster-Whisper or
whisper.cpp. The chat surface defaults to no LLM until the user
configures one.

| Feature | Status | Notes |
|---|---|---|
| Voice input for commands ("add a panel", "new angle") | Planned | STT routes to a command parser; commands map to existing actions in the app. |
| Natural-language editing of scenes and shots | In progress | Editorial chat panel ships today (`apps/web/src/features/chat`). The agent can read measurements (`/measure` slash command) and propose rewrites; auto-apply is gated behind the `voicePassMode` editorial preference. |
| Voice playback of scene descriptions or scripts | Shipped (audio reader); Planned (scene-card playback) | The audio-first prose reader is the foundation; scene-card playback reuses the same TTS slot. |

**Optional cloud:** LLM via Anthropic / OpenAI / Google Gemini for
chat and natural-language editing. Cloud STT (e.g., OpenAI Whisper
API) is plumbed through the same `stt/*` slot but off by default.

---

## 11. Output / render tools

**Local-first contract:** All renders write to the user's filesystem.
Heavy compute can route to a user-controlled GPU host on the same
Tailnet.

| Feature | Status | Notes |
|---|---|---|
| Print-ready graphic novel exports (high-res pages, PDF) | Reserved | Renderers compose panels (area 5) + style bibles (area 8) → CMYK PDF. |
| Web / comic-viewer exports (images, metadata, navigation) | Reserved | Static JSON manifest + per-page images; deploys to any static host. |
| Animatic export (MP4 / sequence with audio) | Reserved | Owned by area 7. |
| Hooks for higher-fidelity animation or 3D renderers | Reserved | Out-process bridges via area 12. |

**Optional cloud:** None for output. Final renders are deterministic
local processes the user can reproduce on a clean machine.

---

## 12. Integration & API layer

**Local-first contract:** The plugin registry is the entire
integration substrate. Every external integration declares itself
as a plugin manifest; the runtime never hard-codes a vendor.

| Feature | Status | Notes |
|---|---|---|
| Plugin registry (manifests, slots, hardware grading) | Shipped | See [`plugin-architecture.md`](plugin-architecture.md). 17 plugins shipping at present (9 local, 8 cloud), spanning TTS, STT, image, music, LLM. Adding a plugin = adding a manifest. |
| Capability-slot resolution | Shipped | `getService(services, capability, fallback)` in `packages/api-client/src/services.ts`. Single dispatch path for `tts/fast`, `tts/quality`, `stt/fast`, `stt/quality`, `image`, `music`, `llm`. |
| MCP server (`galley-mcp`) for AI-agent access | Shipped | 8 tools over the local book(s). Claude Desktop and Claude Code (and any MCP client) can read measurements, inspect profiles, and propose edits without seeing the user's manuscript leave the device unless they explicitly grant it. |
| Connectors to external render APIs / DCC tools | In progress (image / TTS / LLM); Reserved (game-engine / compositor bridges) | DCC bridges (Blender, Godot, Unreal, Resolve, Reaper) are out-process integrations defined as plugin manifests with `kind: local` and a `transport: stdio | websocket | filesystem`. |
| Import / export for assets (characters, backgrounds, props) | Planned | Asset packs are tar bundles with a manifest; import = drop in `<bookRoot>/assets/` and re-index. |
| Project-level config for which tools handle which outputs | Shipped | `<bookRoot>/.galley/services.json` (planned) overrides the global service config per-book. Today this is global via the `useApiConfig` Zustand store. |

**Optional cloud:** This is the area where cloud lives, by design.
Cloud plugins are first-class but slot-scoped. The user can see and
revoke them in Settings → Services.

---

## What "self-hosted" specifically means in galley

| Component | Where it runs by default | Cloud alternative |
|---|---|---|
| Web app (`apps/web`) | User's machine, Vite dev or Tauri build. | None — galley has no SaaS deployment. |
| Book server (`services/book-server`) | User's machine, Node + Express on `:3080`. | None. |
| TTS worker (fast) | Kokoro-FastAPI on user's GPU host. | OpenAI Speech via plugin. |
| TTS worker (quality) | higgs-audio on user's GPU host. | ElevenLabs via plugin. |
| STT worker (fast) | whisper.cpp on user's machine. | (none shipped) |
| STT worker (quality) | Faster-Whisper-large on user's GPU host. | OpenAI Whisper API via plugin (planned). |
| Image worker | ComfyUI / SDNext / Fooocus on user's GPU host. | DALL·E 3, Stability AI, FLUX BFL, Google Imagen, Replicate via plugins. |
| Music worker | MusicGen or higgs-audio on user's GPU host. | (none shipped) |
| LLM | Local model on user's GPU host (planned — currently no local plugin). | Anthropic Claude, OpenAI GPT, Google Gemini via plugins. |
| Editorial state (prose, canon, comments, render history) | User's filesystem under each book repo. | None — never leaves disk by default. |
| Multi-device sync (when added) | Tailscale tailnet between user-owned devices; Sunfish kernel-sync gossip on top. | None — sync is between user devices, not via vendor cloud. |

The deployment topology already in production (`STATUS.md` →
*Deployment topology*) is two machines on a Tailnet: a thin editing
client and a GPU host for inference. Both are user-owned.

## What "optional external API integrations" specifically means

A cloud integration is **opt-in per capability slot** and **per
book**, plumbed through the plugin substrate:

1. The user opens Settings → Services and picks a cloud provider for
   one of the slots (e.g., `llm` → `anthropic-claude`).
2. The user completes the provider's auth flow — see *Authentication
   & 2FA* below for the supported schemes.
3. The capability slot resolver (`getService`) returns the cloud
   endpoint instead of the local one for that slot only. Other
   slots remain local.
4. The cloud call fires only when the user takes an action that uses
   that slot (clicking Send in the chat, running a generate-image
   action). No background polling, no telemetry, no inference on the
   manuscript without an explicit user trigger.
5. Settings → Services surfaces every active cloud slot in the
   environment-scope section so the user always knows what's routed
   off-device.

The plugin registry's `kind: cloud` manifests declare their auth
shape, base URL, and rate-limit constraints. Galley doesn't ship
keys; the user owns them.

## Authentication & 2FA

External services use a small fixed set of authentication schemes.
The choice is per-plugin — declared in each cloud manifest's
`authentication` block — and the user never types provider-specific
code into galley to make it work.

| Scheme | Use case | 2FA story |
|---|---|---|
| **`bearer` / `api-key-header` / `query-param`** | Vendor-issued long-lived API keys (Anthropic, OpenAI, Stability AI, Google Generative Language, Replicate). | User enforces MFA at the provider's console *before* minting the key. Galley does not see the second factor. The secret lives in the OS keychain; the slot config holds only a reference. |
| **`oauth2`** | Cloud APIs gated by OAuth 2.0 (Google Workspace, Microsoft Graph, GitHub Apps, custom Okta integrations, Auth0 apps). | Provider-enforced. The IdP's MFA challenge fires inside the browser (`authorization-code-pkce`) or device (`device-code`) step. Galley waits for the redirect / device confirmation. |
| **`oidc`** | Identity providers issuing ID tokens in addition to access tokens — Okta, Microsoft Entra ID, Auth0, Google with OIDC enabled. | Same as `oauth2`. Manifests can declare `mfa.stepUpScopes` (e.g., `acr_values=urn:okta:loa:2fa:any`) to force re-challenge on sensitive operations. |
| **`mtls`** | Reserved. On-premise services that pin a client cert per device. | n/a — the cert is the credential. Lands when a concrete need surfaces. |
| **`none`** | Anonymous endpoints. | n/a |

### What this means concretely for Okta + similar enterprise IdPs

A cloud plugin whose `authentication` block declares `type: oidc`
with `oauth.provider: okta` is treated as a first-class peer to
API-key plugins:

- The configure dialog asks for the Okta tenant URL up front and
  substitutes it into the issuer / endpoints.
- Galley runs the `authorization-code-pkce` flow against the
  tenant's `/oauth2/default` issuer using a loopback redirect.
- The user's org-level MFA policy (Okta Verify push, WebAuthn,
  TOTP, hardware key) fires inside the browser step. Galley
  doesn't see the factor, doesn't store the factor, and doesn't
  need to know which factor was used.
- Access + refresh tokens land in the OS keychain
  (`oauth.tokenStorage: keychain`). The slot config persists a
  keychain reference only.
- Step-up auth on sensitive operations is supported via
  `mfa.stepUpScopes` — when the manifest requests one of those
  scopes, the IdP re-challenges even if the existing session is
  still valid.

The same shape covers Microsoft Entra ID, Auth0, Google Workspace,
GitHub Apps, and GitLab. The plugin manifest carries the
provider-specific endpoints; galley's runtime is provider-agnostic.

### What galley does **not** do

- Galley does not implement second factors. There is no in-app
  TOTP generator, no SMS handling, no WebAuthn registration UI.
  Those live at the IdP.
- Galley does not store passwords or shared secrets in plaintext.
  Static API keys and OAuth tokens both route through the OS
  keychain (Mac Keychain, Windows Credential Manager, libsecret on
  Linux) with the slot config holding only references.
- Galley does not phone home about auth events. The IdP and the
  user's audit log are the source of truth.

See [`plugin-architecture.md`](plugin-architecture.md#authentication--2fa)
for the full OAuth / MFA manifest field reference and provider
notes.

## Cross-references

- `STATUS.md` — current build state and shipped surfaces.
- `README.md` — quickstart and stack summary.
- `docs/architecture/galley-as-sunfish-accelerator.md` — relationship to Sunfish kernels.
- `docs/architecture/plugin-architecture.md` — plugin manifest schema, registry layout, slot resolution.
- `docs/AUDIO-EDITOR-SPEC.md` — audio-first prose editor design (area 1 + 10 + 11 intersection).
- `prose/ROADMAP.md` — phase plan for the prose-telemetry subsystem (area 1).
- `packages/plugins/registry.json` + `packages/plugins/plugins/*/manifest.json` — current plugin catalog (area 12).
