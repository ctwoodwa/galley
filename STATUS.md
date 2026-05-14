# Galley — state of the work

This file is the breadcrumb index for the current state of galley.
Read first when picking up after a session break or compaction. It
points at the doc set that captures specific decisions; this file
itself is summary + status, not contracts.

**Public URL:** https://github.com/ctwoodwa/galley
**License:** MIT (repo-wide; see `LICENSE`)
**Tech stack:** React 19 + Vite + TypeScript + Tailwind (web) · Node
+ Express (book-server) · Python workers (TTS / STT / image / music)
· pnpm + Turbo workspace.

## Identity

Galley is a **local-first, self-hosted editorial production platform**
built on Sunfish architecture principles. The editorial vertical of
the Sunfish-pattern accelerator family — sibling to Anchor (admin /
dashboard) and Bridge (multi-tenant SaaS shell). See
`docs/architecture/galley-as-sunfish-accelerator.md` for the
positioning + relationship to Sunfish kernel packages.

Galley grows by **tool family** — each family targets one editorial
medium with the same internal pattern:

| Family | Status |
|---|---|
| `prose/` | Phase 0–6 complete: 38 stdlib + 4 spaCy + 4 anti-AI lexical + 9 mid-complexity device + 6 anti-AI structural + 3 sonics + 3 extra detectors. 181 tests green (incl. 16 for editorial-overlay merge). See `prose/ROADMAP.md`. |
| `speech/` | Reserved. TTS/STT-driven editing. |
| `comics/` | Reserved. |
| `video/` | Reserved. |

## Major decisions made this session

| Decision | Source doc |
|---|---|
| Galley is MIT-licensed; primitive editorial tooling consolidates in `galley/prose/` rather than fragmenting into separate repos | `prose/docs/adrs/0004-mit-license.md` + `prose/docs/adrs/0005-prose-first-class-tool-family.md` |
| Vendor-neutral capability slot model — `tts/fast`, `tts/quality`, `stt/fast`, `stt/quality`, `image`, `music` — with families as worker routes and tier as a client-side slot label | `docs/services/README.md` |
| Settings IA is task-first + progressively-disclosed; section primitives (`SettingsShell`, `SettingsSection`, fields) scoped to `.galley-settings` | `docs/settings/ia.md` |
| Editorial letterpress aesthetic for /settings (cream paper, deep ink, vermilion accent, Fraunces + Newsreader + JetBrains Mono) | `apps/web/src/components/settings/settings.css` |
| App-wide theme system via shadcn CSS-variable model — three families (stone / catppuccin / solarized), each with light + dark; mode `auto` follows system preference | `apps/web/src/styles/themes/index.css`, `apps/web/src/app/ThemeProvider.tsx` |
| Multi-machine deployment topology is Tailscale-connected nodes; pairing via Sunfish HMAC primitive is deferred until non-Tailscale federation matters | This file, *Deployment topology* |
| Galley-as-Sunfish-accelerator framing is proposed but not yet ratified upstream — coordination beacon to XO is queued | `docs/architecture/galley-as-sunfish-accelerator.md` |

## Settings sections — current status

Reachable at `/settings` (lazy-loaded route in `apps/web/src/app/router/index.jsx`).
Scope nomenclature per `docs/settings/ia.md` — user / workspace /
module / environment.

| # | Section | Scope | Status | Storage |
|---|---|---|---|---|
| I | Account | user | **Shipped (theme + typography)** | `useThemePrefs` → localStorage; ThemeProvider applies family/mode/font-scale/measure to `<html>` |
| II | Books | workspace | **Shipped (registry shape)** | `useBookRegistry` → localStorage |
| III | Services | environment | **Shipped (form shape, reference)** | `useApiConfig.services` → localStorage |
| IV | Editorial | workspace | **Shipped (form + radio shape)** | `useEditorialPrefs` → localStorage + debounced write-through to `<bookRoot>/.galley/editorial.json`; v3 hydrate-on-mount + reconcile with server-stamped LWW |
| V | Notifications | user | Placeholder | — |
| VI | Integrations | environment | Placeholder | — |
| VII | Advanced | environment | Placeholder | — |
| VIII | Danger zone | environment | **Shipped (action-list shape)** | Resets via store actions; "Clear all" wipes localStorage + reloads |

**Primitives in `apps/web/src/components/settings/`** —
`SettingsShell`, `SettingsSection`, `AdvancedDisclosure`,
`EntryCard`, `ConfirmDialog`, `ToggleField`, `RadioField`, `SelectField`,
`TextField`, `SecretField`, `ActionField`. Scoped CSS in `settings.css`.

**API stress-test result (3 reference sections shipped):** the
primitive API held across form-driven (Services, Editorial) and
registry-driven (Books) layouts. Only one new primitive (`RadioField`)
was needed during Editorial. Two patterns surfaced as candidates for
shared primitives on next repetition: numbered-card layout
(Services slot + Books card share most of it) and confirm-dialog
(Books uses `window.confirm`; Danger zone needs a real one).

## Architectural commits to remember

**Capability slot resolution.** Workers expose one route per family
(`POST /v1/tts/synthesize`, `POST /v1/stt/transcribe`, …). Clients
carry a tier preference (`tier: 'fast' | 'quality'`), look up the
configured slot, and dispatch. Workers don't know about tiers.
`getService(services, capability, fallback)` resolves slot →
`{ baseUrl, apiKey, flavor }` with three-step fallback:
slot-URL → shared-default → null. See `packages/api-client/src/services.ts`.

**Persist migration discipline.** Zustand stores use the persist
middleware with explicit version bumps and migrate handlers:
- `galley.api-config` v3 (added `services` map from legacy
  `baseUrl/apiKey/ttsSource/kokoroLocalUrl`).
- `galley.editorial-prefs` v3 (v2 dropped `activeBookId`; v3 added
  per-book sync `meta` for hydrate-and-reconcile).
- `galley.book-registry` v1 (new).
- `galley.theme-prefs` v1 (new) — `family`, `mode`, `fontScale`, `measure`.
Each migrate handler is in the same file as the store; one localStorage
key per store; bump version when the in-memory shape changes.

**Editorial letterpress is scoped.** All `.gs-*` classes in
`settings.css` are scoped under `.galley-settings`. The rest of
galley's existing dark theme is untouched. Promotion to global is a
future call.

## Deployment topology

The dominant pattern is two machines on a Tailscale tailnet:

- **Editing client** (laptop, often no usable GPU) — runs galley
  web + book-server.
- **GPU host** (workstation/desktop) — runs the worker services
  (Kokoro-FastAPI, higgs-audio, Faster-Whisper, ComfyUI). Each
  worker binds to `0.0.0.0:<port>`. The client points each capability
  slot at the host via MagicDNS hostname.

Sunfish's HMAC pairing service (Anchor's `Services/Pairing/`) is
designed for the non-Tailscale federation case. It's a real primitive
but not load-bearing for galley today.

External worker projects:
- `~/Projects/higgs-audio` (Apache-2.0, TTS-quality + music) —
  external runtime dep, do not vendor.
- `~/Projects/Kokoro-FastAPI` (Apache-2.0, TTS-fast) — same.
- `~/Projects/infrence-studio` (user's pre-galley workbench) —
  candidate for one-time migration pass; mostly superseded by
  galley's `apps/web/src/components/inference/`.

## Recent commit log (galley)

```
e429a8a refactor(settings): extract EntryCard + ConfirmDialog primitives
837f314 docs: STATUS.md breadcrumb + galley-as-sunfish-accelerator framing
ec7629e feat(settings): BooksSection + bookRegistry store
73bd4e9 feat(settings): EditorialSection + RadioField primitive
d25a34a style(settings): editorial letterpress theme for /settings
65acc6e build: pin packageManager field for Turbo 2.x
da04df2 feat(settings): wire SettingsPageV2 into router at /settings
cbb5423 feat(settings): IA spec + primitive components + ServicesSection reference
99330c9 feat(api): vendor-neutral capability slots
c23b8ba build: ignore build/ outputs after history rewrite
1361aa7 docs(prose): mark Phases 4-6 done, log Phase 7 BookNLP blocker
… (Phases 4 / 3 / 2 / 1 / 0.5 / 0 of prose work below)
```

Top of `main` on `origin` is the most recent commit above. Working
tree may carry pre-session edits unrelated to this work —
`git status` to verify.

## Deferred / next moves

Triaged in priority order, none blocking:

1. **Finish remaining placeholder sections** — Account, Notifications,
   Integrations, Advanced. (Danger zone shipped using ConfirmDialog as
   forcing function; EntryCard/ConfirmDialog primitives shipped.)
2. **Wire `BookProfile.from_book_root` into the active CLI/runner** —
   the overlay merge logic ships but the prose CLI doesn't yet call
   `from_book_root` (it loads detector configs ad-hoc). When the CLI
   migrates to the unified loader, every `prose measure` invocation
   will honor the sidecar.
3. **Source-of-truth for the editorial sidecar** — is
   `.galley/editorial.json` committed (git-converged, galley becomes
   a cache/import path) or gitignored (galley owns sync via kernel-
   sync)? Today the v3 LWW reconciler treats galley as the sync
   transport; the answer reshapes that.
4. **Worker installation docs** at `docs/services/{tts-fast,tts-quality,stt,image,music}.md`
   — completes the services story.
5. **Replace legacy SettingsDrawer** in the inference studio with
   `<Link to="/settings">` from a cog button. Removes the right-drawer
   redundancy.
6. **Cog icon in nav** — make `/settings` discoverable from the
   editorial reader header + library page.
7. **Coordination beacon** to Sunfish XO proposing
   galley-as-accelerator + the foundation-ui-settings package upstream.
   See `docs/architecture/galley-as-sunfish-accelerator.md`.
8. **Phase 7 of prose work** — BookNLP integration is blocked on
   PyTorch wheel availability for Intel Mac. See `prose/ROADMAP.md`
   for the four resolution paths.

## Open environment notes

- `pnpm dev` works after pinning `packageManager: pnpm@10.33.4` in
  root `package.json`. If port 3080 collides on book-server startup,
  `lsof -ti tcp:3080 | xargs kill` (a leftover from a prior session).
- `apps/web/src/components/settings/settings.css` loads Fraunces +
  Newsreader from Google Fonts (already in `index.html`).
- The legacy `apps/web/src/pages/inference/SettingsDrawer.tsx`
  continues to serve the production UI for inference-studio settings.
  `/settings` is the new shell; the two coexist.
