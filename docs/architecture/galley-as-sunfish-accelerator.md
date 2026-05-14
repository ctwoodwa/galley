# Galley as a Sunfish accelerator

**Status:** Proposed; pending Sunfish XO ratification.
**Owner:** Galley maintainer.
**Source:** Multi-turn architectural conversation, archived in the
GitHub repo's commit history starting around `99330c9`.

## TL;DR

Galley should be classified as a Sunfish accelerator — the editorial
vertical counterpart to **Anchor** (Zone-A local-first admin /
dashboard) and **Bridge** (Zone-C hybrid multi-tenant SaaS). Same
architectural framework, same kernel primitives, different vertical
user story.

This doc captures the proposal. It does not yet reflect a decision by
Sunfish's XO (the research/PM session in `SunfishSoftware/Sunfish/`).
A coordination beacon is queued for that thread.

## What's the same

Galley adopts the Sunfish accelerator pattern as Anchor exemplifies it:

| Concern | Sunfish primitive | Galley use |
|---|---|---|
| Local encrypted storage | `Sunfish.Foundation.LocalFirst` | Per-book editorial state (prefs, held-lines, motif lists), audit log, render history |
| Sync daemon (gossip) | `Sunfish.Kernel.Sync` | Workspace-scoped state syncs across paired devices: prose changes, comments, render queue |
| CRDT engine | `Sunfish.Kernel.Crdt` | Prose CRDT documents (chapter text, comments) |
| Auth + key handling | `Sunfish.Kernel.Security` | Device-bound Ed25519 keypair, attestation flow |
| Device pairing | `Services/Pairing/` (HMAC) | Mac ↔ Windows-GPU-host pairing; QR onboarding bundle (paste-fallback today) |
| Multi-workspace primitive | `TeamContext` (ADR-0032) | One galley `team` per book — each book gets isolated encrypted DB, event log, CRDT docs, sync state |
| Three-indicator status bar | `SunfishNodeHealthBar` | Galley's sync-state surface in the editor chrome |
| Crew Comms transport | Wave 3.x landed in Anchor | Editorial collaboration: review comments, voice-pass requests, render-complete notifications |

Galley's editorial vertical doesn't change the framework — it composes
the existing Sunfish primitives into editorial-shaped blocks
(`blocks-manuscript`, `blocks-prose-telemetry`, `blocks-story-canon`,
`blocks-audiobook-pipeline`, etc.).

## What's different from Anchor

| Axis | Anchor | Galley |
|---|---|---|
| **Vertical** | Admin / dashboard for small-landlord, small-medical-office reference verticals | Editorial production: prose authoring, book publishing, audiobook + ePub + (future) comics + video |
| **Target user** | Owner / administrator / auditor | Authors, editors, publishers |
| **Tech stack** | .NET MAUI Blazor Hybrid (Win + macOS today; iOS/Android deferred to MAUI 11) | React + Vite + TS + Python workers — JS-on-the-front, Python-on-the-back. Galley validates that Sunfish kernels are consumable cross-language |
| **GPU workers** | None (admin workflows are CPU-bound) | TTS / STT / image / music workers (Kokoro-FastAPI, higgs-audio, Faster-Whisper, ComfyUI) — separate processes, talked to over HTTP via Tailscale |
| **Sync planes** | One (state) | Two: state plane (kernel-sync for prose + canon + render history) and compute plane (HTTP over Tailscale for GPU-bound capabilities) |

The two-plane separation matters: editorial *state* wants CRDT-merged
sync via Sunfish kernel-sync; editorial *compute* (generate audio for
this chapter) wants typed HTTP clients over Tailscale to a GPU host.

## Tech-stack reconciliation

Galley is JS/TS/Python; Sunfish kernels are .NET. Three credible paths:

| Path | Description | Status |
|---|---|---|
| **A. Sidecar host** | Galley installations include a `local-node-host` child process running the Sunfish kernel stack; galley's JS clients call localhost HTTP/gRPC. Pattern already specified in ADR-0032's "isolation: process" escape hatch. | **Recommended for now.** Minimal galley-side work; bigger Sunfish-side ask is exposing kernel-sync's API over HTTP. |
| **B. Reimplement on MAUI Blazor** | Galley rebuilds on the same stack Anchor uses. Massive rewrite. Editorial component surface composes from the same Razor primitives Bridge + Anchor use. | Reserved. Web reader no longer load-bearing for public users (Mac + Win desktop scope acceptable), so this is *possible*. Not justified by current value delta. |
| **C. Wire-protocol bindings** | Sunfish exposes each kernel package's contract via OpenAPI/gRPC; galley speaks the wire protocol from any language. Most architecturally pure but requires Sunfish-side work. | Some primitives may already have wire surfaces (kernel-sync's gossip protocol is in book Appendix A). Worth a survey. |

## Sunfish wave alignment

Galley enters at Anchor's current wave (3.4):

| Anchor capability | Status in Anchor | Galley adoption order |
|---|---|---|
| LocalFirst encrypted store | ✅ landed | First slice; via sidecar |
| Kernel runtime + security | ✅ landed | First slice |
| Device pairing (HMAC) | ✅ landed (Phase 0) | After LocalFirst; Tailscale handles trust today so this is opt-in |
| QR onboarding bundle | ✅ landed (paste fallback) | Same |
| Kernel-sync gossip daemon | ✅ landed | Second slice — when prose sync becomes the priority |
| Kernel-crdt | ✅ landed | Same |
| Crew Comms | ✅ landed | Third slice — review comments, voice-pass requests |
| Multi-team `TeamContext` | 🟡 ADR-0032; impl roll-out is Wave 6 | Fits galley's multi-book story directly |
| Bundle selection UI | ❌ deferred | Galley's editorial-bundle equivalent |
| Audit log surface | ❌ deferred | Galley needs editorial-action audit (commit, render, voice-pass) |
| Platform packaging | ❌ deferred | Both projects deferred |

## Repository placement

Two options once the framing ratifies:

| Option | Tradeoff |
|---|---|
| **Move galley into `Sunfish/accelerators/galley/`** | Strongest symbolic placement. Galley's repo merges into Sunfish's. Breaks the public GitHub URL `github.com/ctwoodwa/galley` unless preserved via redirect. |
| **Peer with declared dependency** | Stay at `SunfishSoftware/galley/`. Galley declares a Sunfish kernel-pkg dependency in `package.json` / project manifest. Preserves the GitHub URL. Easier today. |

**Recommend the peer arrangement** while Sunfish is pre-1.0, with
`Sunfish/accelerators/galley/` reserved for when galley moves there
formally (likely tied to Sunfish opening up publicly).

## Why the Sunfish framework benefits from galley

Galley extends Sunfish's own proof along two axes Anchor + Bridge
don't cover:

1. **Language-agnostic kernel consumption.** Bridge + Anchor are both
   .NET. Galley consuming Sunfish kernels from JS/TS + Python via
   HTTP/gRPC validates that the kernel is genuinely cross-language,
   not "a .NET library with marketing language about openness."
2. **Third vertical.** Anchor's bundles are business workflows
   (small-landlord, small-medical-office). Galley demonstrates that
   the same primitives compose for a creative / editorial vertical.
   The paper's claim "any future accelerator inherits from one" is
   only credible once a non-business one exists.

## What needs Sunfish-side ratification

1. **Accept galley into the accelerator catalog.** Currently the
   catalog is Anchor + Bridge + anchor-mobile-ios. Galley would slot
   in as a peer.
2. **Decide on the adoption path (A / B / C above).** Recommend A
   (sidecar) for the first slice.
3. **Define wire-protocol surface** for the kernel packages galley
   needs first: `kernel-runtime`, `foundation-localfirst`,
   `kernel-security`. (`kernel-sync` and `kernel-crdt` come later.)
4. **Confirm the repository placement** (move vs. peer).

The coordination beacon to write into
`SunfishSoftware/coordination/inbox/pao-question-…-galley-as-accelerator.md`
should pose these four questions concisely and let XO answer.

## Implementation if accepted

Phased rollout to mirror Anchor's wave plan:

| Wave | Galley scope |
|---|---|
| **0 (now)** | This doc. Coordination beacon. Status doc points here. No code change. |
| **1** | Sidecar-host integration: galley spins up `local-node-host` on app start; LocalFirst-backed encrypted DB for per-book editorial state; existing localStorage stores become a fast read cache layered over the encrypted DB. |
| **2** | Kernel-sync wired: prose changes flow as CRDT ops between paired galley nodes (Mac ↔ Windows GPU host). Editorial prefs (workspace scope) sync; Service slot URLs (environment scope) stay local. |
| **3** | Crew Comms consumer for editorial-review and voice-pass coordination. |
| **4** | TeamContext multi-book — galley's existing per-book separation becomes formal per-team isolation. |
| **5** | Bundle-selection UI for editorial blocks. Repository move from `SunfishSoftware/galley/` to `Sunfish/accelerators/galley/` if the framing has ratified by now. |

## References

- Anchor README — `Sunfish/accelerators/anchor/README.md`
- Bridge ADR — `Sunfish/docs/adrs/0031-bridge-hybrid-multi-tenant-saas.md`
- Multi-team `TeamContext` — `Sunfish/docs/adrs/0032-multi-team-anchor-workspace-switching.md`
- Foundation LocalFirst — `Sunfish/docs/adrs/0012-foundation-localfirst.md`
- Federation / sync — `Sunfish/docs/adrs/0013-foundation-integrations.md`
- Local-first architecture paper — `Sunfish/_shared/product/local-node-architecture-paper.md`
- Galley's prose-telemetry ADR set — `galley/prose/docs/adrs/0001..0007`
