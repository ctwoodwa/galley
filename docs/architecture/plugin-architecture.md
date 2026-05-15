# Plugin architecture

**Status:** v1 design — manifest spec stabilized; runtime (install runner,
plugin manager UI, slot dropdowns) lands incrementally.

## Why

Galley is a thin orchestration layer around external tools. The same
editorial workflow may call:

- Kokoro-FastAPI **or** Piper **or** edge-tts for `tts/fast`.
- higgs-audio **or** ElevenLabs **or** OpenAI Speech for `tts/quality`.
- ComfyUI **or** SDNext **or** Stability API **or** DALL·E **or** FLUX
  for `image`.
- Anthropic Claude **or** OpenAI **or** Google Gemini for `llm`.

The current `/settings/services` UI baked the provider list per
capability into a hardcoded array. That doesn't scale: every new tool
the community wires up requires a galley code change. The plugin
architecture replaces "hardcoded provider dropdown" with "registry of
manifests."

## Three layers

```
┌──────────────────────────────────────────────────────────────────┐
│ Galley                                                           │
│   orchestration · slot config · UI · health checks · lifecycle   │
└──────┬───────────────────────────────────────────────────────────┘
       │ reads
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Plugin registry                                                  │
│   index.json + plugins/<id>/manifest.json                        │
└──────┬───────────────────────────────────────────────────────────┘
       │ each manifest describes
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Tool plugin                                                      │
│   local  → subprocess (install / launch / health)                │
│   cloud  → remote API (endpoint / auth / pricing / terms)        │
└──────────────────────────────────────────────────────────────────┘
```

Galley never imports or links a tool. Local tools are subprocesses;
cloud tools are HTTP calls. License compatibility (galley is MIT;
ComfyUI is GPL-3.0) is preserved by the process boundary.

## Plugin kinds

Two `kind` values today.

### `kind: "local"`

A subprocess running on the same host as galley. Manifest carries:

- `install` — per-OS prerequisite list and step commands. Run once;
  produces an install directory under `~/galley-tools/<plugin-id>/`
  by default.
- `launch` — per-OS shell command that starts the worker. Galley
  desktop's tray calls this for Start / Stop / Restart. `{port}` and
  `{install_dir}` are substituted at runtime.
- `health` — relative path + expected status code for the readiness
  probe (e.g. `/health`, `200`). Galley pings this on a 30-second
  loop.

### `kind: "cloud"`

A remote API the user authenticates against. Manifest carries:

- `endpoint` — base URL, default API version, doc link.
- `authentication` — `bearer` / `api-key-header` / `query-param` /
  `oauth2` / `oidc` / `mtls`; declares which header name + which env
  var or keychain key holds the secret, and (for OAuth/OIDC) the
  flow type, endpoints, scopes, and `mfa` block describing
  provider-enforced second factors. See the *Authentication & 2FA*
  section below.
- `pricing` — link to upstream pricing page + a coarse model
  (`pay-per-token` / `pay-per-image` / `subscription` / `free-tier`).
- `terms` — link to acceptable-use policy. Cloud plugins surface this
  in the UI so users see the ToS before configuring.

Cloud plugins skip `install` / `launch` / `health` entirely —
reachability is verified via the configured endpoint + a thin probe
that asserts auth works (typically a small canary call).

## Shared base manifest

Every plugin carries these regardless of `kind`:

| Field | Type | Notes |
|---|---|---|
| `id` | slug | Stable identifier. Matches the folder name under `plugins/`. |
| `name` | string | Display name. |
| `version` | semver | Galley-side manifest version, not upstream tool version. |
| `kind` | `"local" \| "cloud"` | Drives which optional fields are honored. |
| `capabilities` | array of `CapabilityId` | Which slots this plugin fills. |
| `flavor` | string (optional) | API-shape hint consumed by galley clients (e.g. `"kokoro-local"`, `"openai-image"`). |
| `repository` | URL | Canonical source repo (or product page for proprietary services). |
| `readmeUrl` | URL (optional) | Direct link to user-facing docs. Falls back to `repository` when absent. |
| `license` | SPDX id or `"proprietary"` | Informational; not enforced. |
| `description` | string | Two- to three-sentence summary shown in the picker. |
| `hardware` | object | Per-platform `support` and `accel`; see below. |

### Hardware grading

Local plugins declare which platform / accelerator combinations they
support. Cloud plugins use a single `"any"` entry:

```jsonc
"hardware": {
  "macos-arm64":           { "support": "good", "accel": "mps" },
  "macos-x86_64":          { "support": "ok",   "accel": "cpu" },
  "windows-x86_64-nvidia": { "support": "best", "accel": "cuda" },
  "windows-x86_64":        { "support": "ok",   "accel": "cpu" },
  "linux-x86_64-nvidia":   { "support": "best", "accel": "cuda" }
}
```

`support` is one of: `"best" | "good" | "ok" | "partial" | "unsupported"`.

The plugin manager UI filters / grades the list by the running host's
detected platform key (`detect-gpu` helper outputs the key directly).

## Registry

The registry is two files plus a folder per plugin:

```
packages/plugins/
├── manifest-schema.json     ← JSON Schema for validation
├── registry.json            ← index { "plugins": [{ id, manifestPath, ... }] }
└── plugins/
    ├── kokoro-fastapi/
    │   └── manifest.json
    ├── higgs-audio/
    │   └── manifest.json
    └── …
```

For v1 the registry is shipped inside the galley repo. v2 splits it
into a separate `galley-plugin-registry` repo so community plugins
can land via PR there without touching galley. v3 hosts the index on
a CDN with version pinning.

## Slot ↔ plugin assignment

Each capability slot picks one installed plugin. Today's slot config
(`baseUrl`, `apiKey`, `flavor`, `localCommand`, `enabled`) stays as
the runtime data — the plugin manifest just supplies the *defaults*
when the user assigns a plugin to a slot.

Two new state shapes on `useApiConfig` (v5 persist migration):

```ts
interface InstalledPlugin {
  pluginId: string
  version: string         // installed manifest version
  installDir: string      // resolved install path
  installedAt: string     // ISO timestamp
  source: 'registry' | 'local' | 'custom'
}

interface ApiConfigState {
  // …existing fields…
  installedPlugins: Record<string, InstalledPlugin>
  slotAssignments: Partial<Record<CapabilityId, string>>  // slot → pluginId
}
```

When the user picks `Kokoro-FastAPI` for `tts/fast`:

1. `slotAssignments['tts/fast'] = 'kokoro-fastapi'`
2. Slot config absorbs the plugin's defaults (port → `baseUrl`,
   `flavor`, etc.) — overwritable by the user afterwards.

Multiple plugins can be installed for the same capability; the
assignment is the user's choice per-slot.

## Capability slots

| Slot | What | Examples |
|---|---|---|
| `tts/fast` | low-latency text-to-speech | Kokoro-FastAPI, Piper, edge-tts |
| `tts/quality` | high-fidelity (often longer) TTS | higgs-audio, ElevenLabs, OpenAI Speech |
| `stt/fast` | quick speech-to-text | whisper.cpp, faster-whisper-small |
| `stt/quality` | best-effort transcription | faster-whisper-large, WhisperX |
| `image` | image generation | ComfyUI, SDNext, DALL·E, FLUX, Imagen |
| `music` | music / score generation | MusicGen, higgs-audio music |
| `llm` | text generation for editorial agents | Claude, GPT, Gemini |

`llm` is added in this design pass (v4 → v5 persist migration). Used
by voice-pass agents, prose-review summarization, and the planned
co-editor automation.

`embedding` is reserved for v2.

## Installation flow (local plugins)

1. User picks a plugin from `/settings/plugins`, clicks `Install`.
2. Galley desktop (Tauri) spawns the matching `install.steps[<os>]`
   via the user's default shell. Output streams to a progress dialog
   so install failures aren't silent.
3. On success, registers the plugin in `installedPlugins`.
4. If the user clicks `Configure for tts/fast`, slot config absorbs
   the plugin's defaults.
5. The tray's Services menu now exposes Start/Stop/Restart for that
   plugin (uses `launch[<os>]`).

Uninstall removes the install dir + the registry entry. Slot
assignments that referenced the uninstalled plugin clear to `null`
(slot becomes empty until reassigned).

## Configuration flow (cloud plugins)

1. User picks a cloud plugin from `/settings/plugins`, clicks
   `Configure`.
2. Galley walks the auth flow per the manifest's `authentication`.
   The supported schemes are summarised below; see the *Authentication
   & 2FA* section for the full contract.
3. Slot config absorbs the plugin's defaults: `baseUrl`, `flavor`,
   etc.
4. Reachability check fires a thin canary against the configured
   endpoint to surface auth errors immediately.

## Authentication & 2FA

Galley supports the auth schemes a self-hosted editorial app
realistically meets — static secrets for vendor APIs, OAuth 2.0 /
OIDC for enterprise-IdP-fronted services (Okta, Microsoft Entra,
Google Workspace, Auth0, GitHub, GitLab), and mTLS as a deferred
slot for tenants who need it. Two-factor authentication is **always
honored** but never implemented inside galley — it lives at the
provider, either at API-key mint time (static flows) or during the
interactive browser/device step (OAuth/OIDC).

### Supported schemes

| Scheme | When to use | How galley handles it | 2FA story |
|---|---|---|---|
| `api-key-header` / `bearer` | Vendor APIs that issue long-lived keys (Anthropic, OpenAI, Stability, etc.). | Secret stored in OS keychain; slot config persists only the keychain reference. | User enforces MFA at the provider's console *before* minting the key. Galley does not see the second factor. |
| `query-param` | Legacy APIs that require the key as a URL parameter. | Same keychain storage; galley appends the param on every request. | Same as bearer / api-key. |
| `oauth2` | Cloud APIs gated by OAuth 2.0 (Google Workspace, Microsoft Graph, GitHub Apps, custom Okta integrations). | Galley runs the flow declared in the manifest's `authentication.oauth.flow` — `authorization-code-pkce` (default, for desktop), `device-code` (headless), or `client-credentials` (service accounts). Access + refresh tokens land in the OS keychain. | Provider-enforced. The IdP's own MFA challenge fires inside the browser / device step; galley simply waits for the redirect or device confirmation. |
| `oidc` | Identity providers that issue ID tokens in addition to access tokens (Okta OIDC apps, Entra, Auth0). | Same as `oauth2` plus ID-token verification + optional `userinfo` lookup. Issuer URL enables `.well-known/openid-configuration` discovery. | Same as oauth2. The manifest's `mfa.stepUpScopes` can request re-challenge on sensitive scopes (e.g., `acr_values=urn:okta:loa:2fa:any`). |
| `mtls` | Reserved. For on-premise services that pin a client cert per device. | Reserved — design lands when a concrete need surfaces. Slot remains unconfigurable until then. | n/a — the cert is the credential. |
| `none` | Anonymous / open endpoints. | No auth applied. | n/a |

### OAuth manifest fields (cloud plugins)

The `authentication.oauth` block carries everything galley needs to
run an interactive flow without per-provider code:

| Field | Purpose |
|---|---|
| `provider` | Informational tag (`okta`, `auth0`, `google`, `microsoft-entra`, `github`, `gitlab`, `custom`). Drives small UX hints — e.g., for `okta` the configure dialog asks for the tenant URL first. Galley never branches behavior on this. |
| `flow` | `authorization-code-pkce` for desktop apps, `device-code` for headless (e.g., remote SSH session), `client-credentials` for service accounts. |
| `authorizationEndpoint` / `tokenEndpoint` | Explicit endpoints. Optional if `issuer` is set and OIDC discovery is enabled. |
| `deviceAuthorizationEndpoint` | Required for `device-code`. |
| `issuer` | OIDC issuer URL; enables endpoint discovery via `.well-known/openid-configuration`. |
| `scopes` | Default scopes galley requests. User can extend in Settings. |
| `clientIdEnvVar` / `publicClientId` | Source of the OAuth client_id. Public PKCE clients can ship the id in the manifest; enterprise integrations (Okta org-specific) read from an env var the IT admin populates. |
| `redirectUri` | Defaults to a loopback `http://127.0.0.1:<port>/oauth/callback` with a port galley picks at runtime. Override only when the provider requires a specific registered URI. |
| `tokenStorage` | `keychain` (default) or `memory` (ephemeral). |
| `refresh` | Whether the manifest declares refresh tokens are supported. |

### MFA manifest fields

The `authentication.mfa` block is informational — galley doesn't
implement second factors, but surfacing the expectation in the UI
prevents "why is it hanging" confusion:

| Field | Purpose |
|---|---|
| `providerEnforced` | True if the IdP enforces a second factor at sign-in. |
| `factors` | The factor types the provider supports (`totp`, `webauthn`, `push`, `passkey`, etc.). |
| `note` | Free-text guidance ("Okta Verify push on first sign-in"). |
| `stepUpScopes` | Scopes that trigger step-up auth (forces re-MFA on sensitive operations). |

### Concrete provider notes

- **Okta** — OIDC. Manifest pattern: `provider: okta`, `flow:
  authorization-code-pkce`, `issuer: https://<tenant>.okta.com/oauth2/default`,
  `scopes: [openid, profile, email]`. The configure dialog asks for
  the tenant URL up front and substitutes it into both `issuer` and
  (if explicit) `authorizationEndpoint` / `tokenEndpoint`. Org-level
  MFA policy is honored automatically; `acr_values` step-up works via
  `mfa.stepUpScopes`.
- **Microsoft Entra ID** — OIDC. Same shape; `issuer:
  https://login.microsoftonline.com/<tenantId>/v2.0`. Conditional
  Access MFA fires inside the browser step.
- **Google Workspace** — OAuth 2.0 / OIDC. Public PKCE client; user's
  Workspace admin can enforce 2-step verification at the account
  level.
- **Auth0** — OIDC. Same shape as Okta. Rules can layer additional
  MFA challenges; declare them in `mfa.factors` for clarity.
- **GitHub / GitLab** — OAuth 2.0 (no OIDC). For GitHub Apps, prefer
  device-flow on machines without a browser. 2FA is account-level at
  the provider; galley never sees the second factor.

## Manifest examples

See `packages/plugins/plugins/<id>/manifest.json` for the full set.
Highlights:

- **`kokoro-fastapi`** — local TTS, Apache-2.0, works on every
  platform with varying accel.
- **`higgs-audio`** — local TTS quality, Apache-2.0, GPU-required;
  hardware grid marks Mac Intel as `unsupported` (the upstream
  matches PyTorch's Intel-Mac wheel drop after 2.2.x).
- **`comfyui`** — local image, GPL-3.0 (galley loads it as a
  subprocess so license boundary holds).
- **`anthropic-claude`** — cloud LLM, proprietary; `api-key-header:
  x-anthropic-api-key`; pay-per-token; AUP link.
- **`openai-dalle3`** — cloud image, proprietary; `bearer`;
  pay-per-image.
- **`google-imagen`** — cloud image, proprietary; `bearer` against
  Google Generative Language API (`generativelanguage.googleapis.com`);
  pay-per-image.

## Security + threat model

- **Subprocess install commands** are arbitrary shell. The plugin
  registry is curated; community contributions go through a PR
  review. Custom registries (or `kind: "local"` plugins loaded from a
  local folder) should be treated like installing any other shell
  script — galley shows the install command before running it and
  requires explicit confirmation.
- **API keys** for cloud plugins live in the OS keychain. The slot
  config persists a keychain reference, never the secret itself, so
  exporting / syncing config is safe. OAuth access + refresh tokens
  follow the same rule — `authentication.oauth.tokenStorage:
  keychain` (the default) routes them into the OS keychain alongside
  static secrets, with the slot persisting only a reference.
- **Probe traffic** for cloud plugins counts against quotas. The
  default probe interval (30 s) costs a few cents per month for most
  pay-per-call services; users can disable probes per-slot.
- **Manifest schema validation** runs before any install action. A
  malformed manifest can't reach the install runner.

## Open questions (for next iteration)

- **Plugin updates.** Today registry pins manifest versions; upstream
  tool updates aren't tracked. v2 could surface "new upstream
  available" via the manifest's `upstreamReleaseUrl` ATOM feed.
- **Composite plugins.** Should a single plugin be able to fill
  multiple slots simultaneously (e.g. higgs-audio for both `tts/quality`
  and `music`)? Today: yes via `capabilities: [...]`, but the slot
  assignment is per-slot — so the user picks twice.
- **Custom local plugins.** Should the UI support "add a plugin from
  this folder" for users who write their own? Yes — adds `source:
  'local'` to the install record.
- **Cloud cost guardrails.** Should galley track API spend per plugin
  and warn at thresholds? Useful but out of scope for v1.
