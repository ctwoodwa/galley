/**
 * Read-only access to the galley plugin registry.
 *
 * Manifests live as JSON files under `packages/plugins/plugins/<id>/manifest.json`.
 * This module loads them at build time via Vite's `import.meta.glob` so the
 * web bundle gets a typed, in-memory copy. No fetch, no runtime read.
 *
 * Scope today (Phase 1 of the auth-taxonomy workstream):
 *   - List plugins by capability for the Services UI's Provider dropdown.
 *   - Surface the `authentication.type` and `oauth` block so ServicesSection
 *     can render auth-scheme-aware fields (API key vs OAuth Sign-in).
 *
 * Decisions deferred (per the "decide-as-late-as-possible" feedback memo):
 *   - User-installed plugins (loaded at runtime via book-server) — when this
 *     matters, swap the glob for a fetch+cache and keep the same public API.
 *   - A real `@galley/plugins` workspace package — not justified until a
 *     second consumer (Tauri runtime, mcp, book-server) needs the same data.
 *   - Schema validation at load time — the manifests are checked against
 *     `manifest-schema.json` in tooling; runtime trusts the build.
 */

// Vite eagerly imports every manifest.json under packages/plugins/plugins/
// at build time. The keys are absolute virtual paths; values are the parsed
// JSON. `import.meta.glob` lives in Vite types, so this only compiles when
// Vite is the bundler.
const manifestModules = import.meta.glob<PluginManifest>(
  '../../../../packages/plugins/plugins/*/manifest.json',
  { eager: true, import: 'default' },
)

export type PluginKind = 'local' | 'cloud'

export type CapabilityId =
  | 'tts/fast'
  | 'tts/quality'
  | 'stt/fast'
  | 'stt/quality'
  | 'image'
  | 'music'
  | 'llm'

export type AuthType =
  | 'bearer'
  | 'api-key-header'
  | 'oauth2'
  | 'oidc'
  | 'query-param'
  | 'mtls'
  | 'none'
  | 'oauth'

export type OAuthFlow =
  | 'authorization-code-pkce'
  | 'device-code'
  | 'client-credentials'

export type OAuthProvider =
  | 'okta'
  | 'auth0'
  | 'google'
  | 'microsoft-entra'
  | 'github'
  | 'gitlab'
  | 'custom'

export interface OAuthSpec {
  provider?: OAuthProvider
  flow: OAuthFlow
  authorizationEndpoint?: string
  tokenEndpoint?: string
  deviceAuthorizationEndpoint?: string
  issuer?: string
  scopes?: string[]
  clientIdEnvVar?: string
  publicClientId?: string
  redirectUri?: string
  tokenStorage?: 'keychain' | 'memory'
  refresh?: boolean
}

export interface MfaSpec {
  providerEnforced?: boolean
  factors?: string[]
  note?: string
  stepUpScopes?: string[]
}

export interface PluginAuthentication {
  type: AuthType
  header?: string
  queryParam?: string
  apiKeyEnvVar?: string
  signupUrl?: string
  consoleUrl?: string
  oauth?: OAuthSpec
  mfa?: MfaSpec
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  kind: PluginKind
  capabilities: CapabilityId[]
  flavor?: string
  repository?: string
  readmeUrl?: string
  license?: string
  description?: string
  defaults?: {
    baseUrl?: string
    model?: string
    [k: string]: unknown
  }
  endpoint?: {
    baseUrl: string
    apiVersion?: string
    docsUrl?: string
  }
  authentication?: PluginAuthentication
  // (other fields ignored at this layer; add as the UI needs them)
  [extra: string]: unknown
}

/** Snapshot of all manifests keyed by plugin id. */
const BY_ID: Map<string, PluginManifest> = new Map(
  Object.values(manifestModules).map((m) => [m.id, m]),
)

/** Look up a plugin by its `id`. Returns `null` when not found — callers
 *  should handle this for custom providers the user typed in manually. */
export function getPlugin(id: string): PluginManifest | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

/** All plugins that advertise the given capability. */
export function listPluginsForCapability(
  capability: CapabilityId,
): PluginManifest[] {
  const out: PluginManifest[] = []
  for (const m of BY_ID.values()) {
    if (m.capabilities.includes(capability)) out.push(m)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Provider-select options for one capability slot. Cloud + local plugins
 *  share the dropdown; the manifest tells ServicesSection what auth UI to
 *  render once the user picks one. */
export function providerOptionsForCapability(
  capability: CapabilityId,
): { value: string; label: string }[] {
  return listPluginsForCapability(capability).map((m) => ({
    value: m.id,
    label: m.name,
  }))
}

/** Normalised view of the auth scheme for a plugin id. Returns a coarse
 *  category the UI branches on. `'oauth'` (deprecated alias) is folded
 *  into `'oauth2'`. Unknown / missing plugin → `'unknown'`. */
export type AuthCategory =
  | 'api-key'
  | 'oauth'
  | 'mtls'
  | 'none'
  | 'unknown'

export function authCategoryForProvider(
  providerId: string,
): { category: AuthCategory; manifest: PluginManifest | null } {
  const manifest = getPlugin(providerId)
  if (!manifest) return { category: 'unknown', manifest: null }
  const t = manifest.authentication?.type
  switch (t) {
    case 'bearer':
    case 'api-key-header':
    case 'query-param':
      return { category: 'api-key', manifest }
    case 'oauth':
    case 'oauth2':
    case 'oidc':
      return { category: 'oauth', manifest }
    case 'mtls':
      return { category: 'mtls', manifest }
    case 'none':
    case undefined:
      return { category: 'none', manifest }
    default:
      return { category: 'unknown', manifest }
  }
}
