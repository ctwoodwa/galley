# ADR-0007 — Galley as Sunfish editorial example — local-first commitments

**Status:** Locked 2026-05-14

## Context

Galley's README positions it as "Editorial production platform for book publishing workflows." Across this conversation, CO clarified the deeper framing: galley is another example of the Sunfish local-first, self-hosted initiative, dedicated to editorial work. The same architectural commitments that define Anchor (Zone A reference implementation) and Bridge (Zone C hybrid) in *The Inverted Stack* apply to galley — the device is the truth; the network is an optimization; the user owns their data and their compute.

Without this framing, the prose-telemetry roadmap could drift into a SaaS-shaped design (third-party API dependencies, hosted dashboards, vendor lock-in). The Sunfish framing forecloses those patterns by design.

## Decision

`galley/prose/` follows Sunfish local-first principles, codified as commitments below. The same commitments extend to future galley tool families (speech, comics, video).

### Local-first commitments

1. **The device is the truth.** Book content, detector outputs (`.prose-metrics.json`), book profiles (`book.editorial.yaml`), held-lines exemptions, and cached compute results all live on the user's filesystem. No third-party storage for any of these.
2. **Default mode is offline-capable.** Every CPU-tier detector and aggregate runs without a network connection. The book repo's `make code-check` works on a laptop on a plane.
3. **Network is an optimization.** GPU-tier features (metaphor, paradox, foreshadow, knowledge-state — all Phase 9+) route through HTTP endpoints when configured. They are *opt-in enhancements*, never preconditions.
4. **Remote compute is user-controlled.** "Remote" means a server the user owns (workstation in their office, rented box, research cluster they have access to) running the same `galley/services/python-workers/` code. It never means a third-party SaaS galley vendored in.
5. **Provenance is honest.** Every finding's metadata carries `compute.host` and `compute.mode` (local-cpu, local-gpu, remote-self-hosted). Users see where their prose was analyzed.
6. **Graceful degradation.** When a configured remote endpoint is unreachable, the verdict layer continues with local-only output. Findings are tagged `mode: "local-fallback"` so dashboards can surface that the result is the lower-quality path. The pipeline never blocks waiting for network.
7. **End-to-end user ownership of credentials.** Auth tokens (Bearer for remote GPU API) live in user-controlled localStorage / env vars / config files. Never embedded in galley source; never required for default operation; never phoned home.
8. **No third-party SaaS dependencies for core functionality.** Permissive-licensed F/OSS libraries are fine (textstat, BookNLP, spaCy, etc.). Hosted services that would gate galley's operation on a vendor's uptime are not.

### Sibling-family extension

The same commitments apply to `galley/speech/`, `galley/comics/`, `galley/video/`. TTS and STT models route through user-controlled GPU servers (already galley's pattern). Image generation flows through ComfyUI on the user's GPU. Video and comics tooling will follow.

## Consequences

- Architecture choices are filtered through these commitments. A proposed dependency on a hosted API is rejected by default. An OpenAPI endpoint design always specifies that the *same* worker runs both locally and remotely (per ADR-0006).
- The book repo's editorial workflow is portable: clone, install, run, no signup, no API keys (unless the user has their own GPU server they want to attach).
- A future "multi-tenant galley" SaaS (if it ever exists) would be a deployment-mode of galley, owned by whoever runs it — not a sanctioned project deliverable. Galley remains the local-first reference implementation.

## Notes

This ADR aligns galley with Kleppmann's seven local-first properties (the framing used in *The Inverted Stack*'s discovery skill). It does not claim full local-first conformance — multi-device sync of book content across an author's laptop and desktop, for example, is not a current galley feature. The aspiration is the architecture; the implementation grows toward it.

When a feature proposal would compromise one of the eight commitments above, the proposal is reshaped, isolated to an opt-in path, or rejected. This ADR is the basis for that filter.
