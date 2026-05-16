//! OAuth 2.0 / OIDC runtime — authorization-code with PKCE.
//!
//! Phase 2 scope (per task #82):
//!   - Read the OAuth surface from a plugin's `manifest.json` (the
//!     `authentication.oauth` block declared by `packages/plugins/
//!     manifest-schema.json`).
//!   - Run the authorization-code-pkce flow against a loopback listener.
//!     The flow's HTTP listener binds to `127.0.0.1:<ephemeral>` and
//!     receives the IdP's redirect; the rest of the exchange happens
//!     over `reqwest`/`rustls`.
//!   - Persist the resulting access + refresh tokens (when present) in
//!     the OS keychain via `keyring-rs`. macOS Keychain Services on this
//!     platform; Windows Credential Manager / libsecret on others.
//!
//! Out of scope (Phase 3 #83 + later): device-code flow, client-
//! credentials flow, automatic refresh on 401, OIDC ID-token claim
//! parsing beyond a minimal `sub` / `preferred_username` peek.
//!
//! Design notes:
//!   - `oauth_begin` returns once the auth URL is opened in the browser.
//!     The callback handler runs in a detached tokio task; on success or
//!     failure it emits a `galley://oauth-result` event the React side
//!     listens for. This avoids holding a Tauri command open across the
//!     user's browser interaction (which can be minutes).
//!   - State + PKCE verifier are stashed in an in-memory map keyed by
//!     plugin id. A second `oauth_begin` for the same plugin discards
//!     the prior flow (last-one-wins; no concurrent flows per plugin).
//!   - Token storage is keyed by `galley.oauth.<pluginId>` so multiple
//!     plugins can each hold credentials side-by-side.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use once_cell::sync::Lazy;
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, CsrfToken, EndpointNotSet, EndpointSet,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::async_runtime::{spawn, Mutex as AsyncMutex};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;
use url::Url;

/// Maximum time we wait for the IdP to redirect back to the loopback
/// listener before giving up. Five minutes covers normal MFA prompts;
/// flows that need longer should re-trigger `oauth_begin`.
const FLOW_TIMEOUT: Duration = Duration::from_secs(300);

/// Tauri event emitted when an OAuth flow finishes (success or fail).
const OAUTH_RESULT_EVENT: &str = "galley://oauth-result";

/// In-flight flow state. We don't persist this — if the desktop app
/// restarts mid-flow, the user just starts over.
struct FlowState {
    verifier: PkceCodeVerifier,
    csrf: CsrfToken,
}

/// Map of plugin-id → in-flight flow. Replaced on each `oauth_begin`
/// for the same plugin so a stale flow can't race a fresh one.
static FLOWS: Lazy<Arc<AsyncMutex<HashMap<String, FlowState>>>> =
    Lazy::new(|| Arc::new(AsyncMutex::new(HashMap::new())));

// ── Manifest schema parsing ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PluginManifest {
    /// Plugin id from the manifest. Mostly informational here — the
    /// caller already passed the id; we reload to cross-check.
    id: String,
    /// Display name (used in error messages if we ever surface them).
    name: Option<String>,
    authentication: Option<ManifestAuth>,
}

#[derive(Debug, Deserialize)]
struct ManifestAuth {
    #[serde(rename = "type")]
    auth_type: String,
    oauth: Option<ManifestOauth>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ManifestOauth {
    flow: String,
    #[serde(rename = "authorizationEndpoint")]
    authorization_endpoint: Option<String>,
    #[serde(rename = "tokenEndpoint")]
    token_endpoint: Option<String>,
    scopes: Option<Vec<String>>,
    #[serde(rename = "clientIdEnvVar")]
    client_id_env_var: Option<String>,
    #[serde(rename = "publicClientId")]
    public_client_id: Option<String>,
    /// Declared storage policy. We always use the keychain today;
    /// this field is reserved for "memory" sessions later.
    #[serde(rename = "tokenStorage")]
    token_storage: Option<String>,
}

// ── Plugin-manifest resolution ───────────────────────────────────────────────

/// Walk up from `current_exe` looking for `packages/plugins/plugins/`.
/// Mirrors `services::resolve_book_server_path` so dev (`cargo tauri dev`)
/// and prod (.app) both reach the manifests.
fn manifest_path(plugin_id: &str) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut p = exe.as_path();
    for _ in 0..12 {
        let candidate = p
            .join("packages/plugins/plugins")
            .join(plugin_id)
            .join("manifest.json");
        if candidate.exists() {
            return Some(candidate);
        }
        p = p.parent()?;
    }
    None
}

fn load_manifest(plugin_id: &str) -> Result<PluginManifest, String> {
    let path = manifest_path(plugin_id)
        .ok_or_else(|| format!("plugin '{plugin_id}' manifest not found"))?;
    let bytes =
        std::fs::read(&path).map_err(|e| format!("read {}: {}", path.display(), e))?;
    serde_json::from_slice::<PluginManifest>(&bytes)
        .map_err(|e| format!("parse {}: {}", path.display(), e))
}

// ── Token storage ────────────────────────────────────────────────────────────

/// Serialized form of an OAuth token bundle. Kept JSON-shaped so the
/// keychain entry is portable and human-debuggable.
#[derive(Debug, Serialize, Deserialize)]
struct StoredToken {
    access_token: String,
    refresh_token: Option<String>,
    /// Unix epoch seconds. None when the provider didn't supply an
    /// `expires_in`; the access token then has provider-defined lifetime.
    expires_at: Option<u64>,
    /// Best-effort identity label (`sub` / `preferred_username` / token-
    /// endpoint `id` field). Surfaced in the UI so the user knows which
    /// account is connected.
    identity: Option<String>,
}

fn keyring_service(plugin_id: &str) -> String {
    format!("galley.oauth.{}", plugin_id)
}

fn write_keychain(plugin_id: &str, token: &StoredToken) -> Result<(), String> {
    let entry = keyring::Entry::new(&keyring_service(plugin_id), "default")
        .map_err(|e| format!("keyring entry: {e}"))?;
    let payload = serde_json::to_string(token).map_err(|e| format!("serialize: {e}"))?;
    entry
        .set_password(&payload)
        .map_err(|e| format!("keychain write: {e}"))
}

fn read_keychain(plugin_id: &str) -> Option<StoredToken> {
    let entry = keyring::Entry::new(&keyring_service(plugin_id), "default").ok()?;
    let payload = entry.get_password().ok()?;
    serde_json::from_str(&payload).ok()
}

fn delete_keychain(plugin_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(&keyring_service(plugin_id), "default")
        .map_err(|e| format!("keyring entry: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // "No matching entry" is fine — caller wanted it gone, it is.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete: {e}")),
    }
}

// ── Loopback callback listener ───────────────────────────────────────────────

#[derive(Debug)]
struct Callback {
    code: String,
    state: String,
}

/// Bind a tokio TcpListener on `127.0.0.1:0` and return the bound port.
async fn bind_loopback() -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("loopback bind: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();
    Ok((listener, port))
}

/// Accept one HTTP request on the listener, extract `code` + `state`
/// from the query string, send a tiny HTML response, and return them.
/// Caller handles the FLOW_TIMEOUT around this future.
async fn await_callback(listener: TcpListener) -> Result<Callback, String> {
    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("accept: {e}"))?;
    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("read request: {e}"))?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let request_line = req.lines().next().unwrap_or("");
    // Format: "GET /oauth/callback?code=...&state=... HTTP/1.1"
    let path_with_query = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "malformed request line".to_string())?;
    let parsed = Url::parse(&format!("http://127.0.0.1{path_with_query}"))
        .map_err(|e| format!("parse callback url: {e}"))?;
    let mut code = None;
    let mut state = None;
    let mut err = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => err = Some(v.into_owned()),
            _ => {}
        }
    }
    // Reply with a self-closing HTML page either way so the browser
    // doesn't sit on a "request failed" loop.
    let body = match (&code, &err) {
        (Some(_), _) => {
            "<!doctype html><html><head><title>Galley</title>\
             <style>body{font-family:system-ui;padding:48px;\
             text-align:center;color:#0f172a}h1{font-weight:600}\
             </style></head><body><h1>Signed in.</h1>\
             <p>You can close this window and return to Galley.</p>\
             </body></html>"
        }
        _ => {
            "<!doctype html><html><head><title>Galley</title>\
             <style>body{font-family:system-ui;padding:48px;\
             text-align:center;color:#7f1d1d}h1{font-weight:600}\
             </style></head><body><h1>Sign-in failed.</h1>\
             <p>You can close this window and try again in Galley.</p>\
             </body></html>"
        }
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    if let Some(e) = err {
        return Err(format!("authorization-server error: {e}"));
    }
    Ok(Callback {
        code: code.ok_or_else(|| "callback missing 'code'".to_string())?,
        state: state.ok_or_else(|| "callback missing 'state'".to_string())?,
    })
}

// ── Identity extraction ──────────────────────────────────────────────────────

/// Best-effort: peek a JWT's payload for `preferred_username` / `sub`.
/// Returns None for opaque tokens or parse errors — caller falls back
/// to "(signed in)" UX.
fn identity_from_jwt(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&payload).ok()?;
    v.get("preferred_username")
        .or_else(|| v.get("email"))
        .or_else(|| v.get("sub"))
        .and_then(|s| s.as_str())
        .map(str::to_string)
}

// ── Flow orchestration ───────────────────────────────────────────────────────

/// Public payload emitted as the body of `galley://oauth-result`.
#[derive(Debug, Serialize, Clone)]
struct OauthResultEvent {
    plugin_id: String,
    ok: bool,
    identity: Option<String>,
    error: Option<String>,
}

/// `oauth_begin` payload returned to the React side.
#[derive(Debug, Serialize)]
pub struct BeginResult {
    pub auth_url: String,
    pub state: String,
    pub port: u16,
}

/// `oauth_status` payload.
#[derive(Debug, Serialize)]
pub struct StatusResult {
    pub signed_in: bool,
    pub identity: Option<String>,
    pub expires_at: Option<u64>,
}

fn build_client(
    manifest_oauth: &ManifestOauth,
    client_id: &str,
    redirect_uri: &str,
) -> Result<
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>,
    String,
> {
    let auth_url = manifest_oauth
        .authorization_endpoint
        .as_deref()
        .ok_or_else(|| "manifest missing oauth.authorizationEndpoint".to_string())?;
    let token_url = manifest_oauth
        .token_endpoint
        .as_deref()
        .ok_or_else(|| "manifest missing oauth.tokenEndpoint".to_string())?;
    let client = BasicClient::new(ClientId::new(client_id.to_string()))
        .set_auth_uri(AuthUrl::new(auth_url.to_string()).map_err(|e| format!("auth url: {e}"))?)
        .set_token_uri(
            TokenUrl::new(token_url.to_string()).map_err(|e| format!("token url: {e}"))?,
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_uri.to_string()).map_err(|e| format!("redirect: {e}"))?,
        );
    Ok(client)
}

fn resolve_client_id(manifest_oauth: &ManifestOauth) -> Result<String, String> {
    if let Some(pub_id) = manifest_oauth.public_client_id.as_deref() {
        if !pub_id.is_empty() {
            return Ok(pub_id.to_string());
        }
    }
    if let Some(var) = manifest_oauth.client_id_env_var.as_deref() {
        if let Ok(v) = std::env::var(var) {
            if !v.is_empty() {
                return Ok(v);
            }
        }
        return Err(format!(
            "client id env var '{var}' not set; export it before begin"
        ));
    }
    Err("manifest declares neither publicClientId nor clientIdEnvVar".into())
}

/// Random alphanumeric state token. We rely on the oauth2 crate's
/// CsrfToken for the CSRF value, but having a stable plugin-side string
/// is useful for log correlation.
#[allow(dead_code)]
fn random_state() -> String {
    let mut rng = rand::thread_rng();
    (0..24)
        .map(|_| {
            let i = rng.gen_range(0..62);
            match i {
                0..=9 => (b'0' + i) as char,
                10..=35 => (b'a' + (i - 10)) as char,
                _ => (b'A' + (i - 36)) as char,
            }
        })
        .collect()
}

// ── Public entry points (called from Tauri commands) ─────────────────────────

pub async fn begin<R: Runtime>(
    app: AppHandle<R>,
    plugin_id: String,
) -> Result<BeginResult, String> {
    let manifest = load_manifest(&plugin_id)?;
    let auth = manifest
        .authentication
        .ok_or_else(|| format!("plugin '{plugin_id}' has no authentication block"))?;
    if auth.auth_type != "oauth2" && auth.auth_type != "oauth" && auth.auth_type != "oidc" {
        return Err(format!(
            "plugin '{plugin_id}' authentication.type is '{}', not oauth2/oidc",
            auth.auth_type
        ));
    }
    let manifest_oauth = auth
        .oauth
        .ok_or_else(|| format!("plugin '{plugin_id}' missing authentication.oauth"))?;
    if manifest_oauth.flow != "authorization-code-pkce" {
        return Err(format!(
            "Phase 2 only implements authorization-code-pkce; manifest declares '{}'",
            manifest_oauth.flow
        ));
    }
    let client_id = resolve_client_id(&manifest_oauth)?;
    let (listener, port) = bind_loopback().await?;
    let redirect_uri = format!("http://127.0.0.1:{port}/oauth/callback");
    let client = build_client(&manifest_oauth, &client_id, &redirect_uri)?;

    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let scopes: Vec<Scope> = manifest_oauth
        .scopes
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(Scope::new)
        .collect();
    let (auth_url, csrf) = client
        .authorize_url(CsrfToken::new_random)
        .add_scopes(scopes)
        .set_pkce_challenge(challenge)
        .url();

    let state_string = csrf.secret().clone();
    FLOWS.lock().await.insert(
        plugin_id.clone(),
        FlowState { verifier, csrf },
    );

    // Spawn the callback handler. It runs independently of the command;
    // when complete it emits the result event the React side listens for.
    let app_clone = app.clone();
    let plugin_id_for_task = plugin_id.clone();
    let token_endpoint = manifest_oauth.token_endpoint.clone();
    let _ = manifest.id;
    let client_for_task = client;
    spawn(async move {
        let outcome = run_listener(
            app_clone.clone(),
            plugin_id_for_task.clone(),
            listener,
            client_for_task,
            token_endpoint,
        )
        .await;
        let payload = match outcome {
            Ok(identity) => OauthResultEvent {
                plugin_id: plugin_id_for_task,
                ok: true,
                identity,
                error: None,
            },
            Err(err) => OauthResultEvent {
                plugin_id: plugin_id_for_task,
                ok: false,
                identity: None,
                error: Some(err),
            },
        };
        let _ = app_clone.emit(OAUTH_RESULT_EVENT, payload);
    });

    Ok(BeginResult {
        auth_url: auth_url.to_string(),
        state: state_string,
        port,
    })
}

async fn run_listener<R: Runtime>(
    _app: AppHandle<R>,
    plugin_id: String,
    listener: TcpListener,
    client: BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>,
    _token_endpoint: Option<String>,
) -> Result<Option<String>, String> {
    let callback = timeout(FLOW_TIMEOUT, await_callback(listener))
        .await
        .map_err(|_| "timed out waiting for the OAuth callback".to_string())??;

    let flow = {
        let mut map = FLOWS.lock().await;
        map.remove(&plugin_id)
            .ok_or_else(|| "flow state missing — was oauth_begin called?".to_string())?
    };

    if flow.csrf.secret() != &callback.state {
        return Err("CSRF state mismatch — refusing to exchange code".into());
    }

    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("build http client: {e}"))?;
    let token_response = client
        .exchange_code(AuthorizationCode::new(callback.code))
        .set_pkce_verifier(PkceCodeVerifier::new(flow.verifier.secret().clone()))
        .request_async(&http_client)
        .await
        .map_err(|e| format!("token exchange: {e}"))?;

    let access = token_response.access_token().secret().clone();
    let refresh = token_response
        .refresh_token()
        .map(|t| t.secret().clone());
    let expires_at = token_response.expires_in().and_then(|d| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|now| now.as_secs() + d.as_secs())
    });
    let identity = identity_from_jwt(&access);

    let stored = StoredToken {
        access_token: access,
        refresh_token: refresh,
        expires_at,
        identity: identity.clone(),
    };
    write_keychain(&plugin_id, &stored)?;
    Ok(identity)
}

pub fn status(plugin_id: &str) -> StatusResult {
    let token = read_keychain(plugin_id);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
        .unwrap_or(0);
    match token {
        Some(t) => {
            let signed_in = t.expires_at.map_or(true, |exp| exp > now);
            StatusResult {
                signed_in,
                identity: t.identity,
                expires_at: t.expires_at,
            }
        }
        None => StatusResult {
            signed_in: false,
            identity: None,
            expires_at: None,
        },
    }
}

pub async fn signout(plugin_id: &str) -> Result<(), String> {
    // Clear any in-flight flow state too, just in case.
    FLOWS.lock().await.remove(plugin_id);
    delete_keychain(plugin_id)
}

/// Public helper for ad-hoc challenge inspection — currently unused
/// outside tests but kept on the surface to avoid a `dead_code` warning
/// in case downstream features (e.g. probe-with-token) want it.
#[allow(dead_code)]
pub fn sha256_b64url(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}
