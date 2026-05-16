/**
 * OAuth bridge — React side of the Tauri-runtime authorization-code-
 * pkce flow declared in `apps/desktop/src-tauri/src/oauth.rs`.
 *
 * All four entry points (begin / status / signout / onResult) check
 * `isTauri()` first. In a plain browser session they're no-ops or
 * throw `OAuthUnavailableError` so callers can fall back gracefully
 * (the API-key field in Services, an "Open Galley desktop" CTA, etc.).
 */

export class OAuthUnavailableError extends Error {
  constructor(message = 'OAuth flows are only available inside the Galley desktop app.') {
    super(message)
    this.name = 'OAuthUnavailableError'
  }
}

export interface OAuthBeginResult {
  authUrl: string
  state: string
  port: number
}

export interface OAuthStatus {
  signedIn: boolean
  identity: string | null
  expiresAt: number | null
}

export interface OAuthResultPayload {
  pluginId: string
  ok: boolean
  identity: string | null
  error: string | null
}

const OAUTH_RESULT_EVENT = 'galley://oauth-result'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Kick off an OAuth flow for `pluginId`. Returns the authorization URL +
 * CSRF state; the caller should open the URL in the system browser
 * (this helper does that automatically when `openInBrowser` is true,
 * which is the default). The callback handler runs in the background;
 * subscribe via {@link onOAuthResult} to learn when it completes.
 */
export async function beginOAuth(
  pluginId: string,
  { openInBrowser = true }: { openInBrowser?: boolean } = {},
): Promise<OAuthBeginResult> {
  if (!isTauri()) throw new OAuthUnavailableError()
  const { invoke } = await import('@tauri-apps/api/core')
  const raw = await invoke<{
    auth_url: string
    state: string
    port: number
  }>('oauth_begin', { pluginId })
  const result: OAuthBeginResult = {
    authUrl: raw.auth_url,
    state: raw.state,
    port: raw.port,
  }
  if (openInBrowser) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(result.authUrl)
    } catch {
      // Best-effort — if the opener plugin isn't wired the caller can
      // still navigate the user manually via `result.authUrl`.
    }
  }
  return result
}

/**
 * Inspect token storage for a plugin. Returns whether we have a token
 * we believe is still live + a best-effort identity label.
 */
export async function getOAuthStatus(pluginId: string): Promise<OAuthStatus> {
  if (!isTauri()) {
    return { signedIn: false, identity: null, expiresAt: null }
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const raw = await invoke<{
    signed_in: boolean
    identity: string | null
    expires_at: number | null
  }>('oauth_status', { pluginId })
  return {
    signedIn: raw.signed_in,
    identity: raw.identity,
    expiresAt: raw.expires_at,
  }
}

/** Drop the stored tokens for a plugin. Idempotent. */
export async function signOutOAuth(pluginId: string): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke<void>('oauth_signout', { pluginId })
}

/**
 * Subscribe to OAuth-flow completion. The callback receives a payload
 * for any plugin's flow; consumers filter by `pluginId` themselves.
 * Returns the unsubscribe function.
 */
export async function onOAuthResult(
  cb: (payload: OAuthResultPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{
    plugin_id: string
    ok: boolean
    identity: string | null
    error: string | null
  }>(OAUTH_RESULT_EVENT, (event) => {
    cb({
      pluginId: event.payload.plugin_id,
      ok: event.payload.ok,
      identity: event.payload.identity,
      error: event.payload.error,
    })
  })
}
