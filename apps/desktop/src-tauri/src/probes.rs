//! Worker-slot health probes.
//!
//! Reads the slot configurations from the running book-server's
//! /api/config/services endpoint (when available) and pings each
//! configured worker URL's `/health` on a 30-second timer. Emits
//! `galley://probe-update` with the consolidated status so the React
//! app can show a Services panel and the tray can render colored
//! status dots.
//!
//! Workers run on remote tailnet hosts in the dominant deployment so
//! we only observe — there's no Start/Stop control from the tray for
//! non-local workers (that would require ssh / wake-on-lan, out of
//! scope). Local-launch comes back via per-slot `localCommand` in a
//! later release; the probe loop is the same either way.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Emitter, Runtime};

const PROBE_INTERVAL: Duration = Duration::from_secs(30);
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const BOOK_SERVER_BASE: &str = "http://localhost:3080";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotProbe {
    pub slot: String,
    pub state: String, // "reachable" | "unreachable" | "not_configured" | "disabled"
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServiceConfig {
    enabled: bool,
    provider: Option<String>,
    #[serde(rename = "baseUrl")]
    base_url: Option<String>,
}

/// Slot map shape mirrors `galley/packages/api-client`'s
/// `ServicesConfig`. Today the desktop shell reads this through a
/// future book-server endpoint; until that lands we fall back to a
/// canonical slot list with no providers configured.
const KNOWN_SLOTS: &[&str] = &[
    "tts/fast",
    "tts/quality",
    "stt/fast",
    "stt/quality",
    "image",
    "music",
];

pub fn start_probe_loop<R: Runtime>(app: AppHandle<R>) {
    spawn(async move {
        let client = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
            Ok(c) => c,
            Err(_) => return,
        };
        loop {
            let probes = run_probes(&client).await;
            let _ = app.emit("galley://probe-update", &probes);
            tokio::time::sleep(PROBE_INTERVAL).await;
        }
    });
}

pub fn refresh_all<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    spawn(async move {
        let client = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
            Ok(c) => c,
            Err(_) => return,
        };
        let probes = run_probes(&client).await;
        let _ = handle.emit("galley://probe-update", &probes);
    });
}

async fn run_probes(client: &reqwest::Client) -> Vec<SlotProbe> {
    // 1. Ask book-server which slots are configured. Endpoint TBD —
    //    falls back to KNOWN_SLOTS with empty configs if missing.
    let slots = fetch_slot_configs(client).await;

    // 2. Probe each one.
    let mut out: Vec<SlotProbe> = Vec::with_capacity(slots.len());
    for (slot_name, cfg) in slots {
        if !cfg.enabled {
            out.push(SlotProbe {
                slot: slot_name,
                state: "disabled".to_string(),
                provider: cfg.provider,
                base_url: cfg.base_url,
                latency_ms: None,
            });
            continue;
        }
        let Some(url) = cfg.base_url.as_ref().filter(|u| !u.is_empty()) else {
            out.push(SlotProbe {
                slot: slot_name,
                state: "not_configured".to_string(),
                provider: cfg.provider,
                base_url: None,
                latency_ms: None,
            });
            continue;
        };
        let health = format!("{}/health", url.trim_end_matches('/'));
        let started = std::time::Instant::now();
        let ok = client.get(&health).send().await.map(|r| r.status().is_success()).unwrap_or(false);
        let latency_ms = if ok {
            Some(started.elapsed().as_millis() as u64)
        } else {
            None
        };
        out.push(SlotProbe {
            slot: slot_name,
            state: if ok { "reachable" } else { "unreachable" }.to_string(),
            provider: cfg.provider,
            base_url: Some(url.clone()),
            latency_ms,
        });
    }
    out
}

async fn fetch_slot_configs(
    client: &reqwest::Client,
) -> Vec<(String, ServiceConfig)> {
    // The book-server doesn't expose a slot-config endpoint yet —
    // when it does, we'll fetch from /api/config/services. Until then
    // we report all canonical slots as not_configured so the user can
    // see them in the tray and know what's wired up vs missing.
    //
    // TODO(galley/book-server): add GET /api/config/services returning
    //   { "tts/fast": {enabled, provider, baseUrl, …}, ... }
    let url = format!("{BOOK_SERVER_BASE}/api/config/services");
    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(map) = resp.json::<std::collections::HashMap<String, ServiceConfig>>().await {
                return map.into_iter().collect();
            }
        }
    }
    KNOWN_SLOTS
        .iter()
        .map(|s| {
            (
                s.to_string(),
                ServiceConfig {
                    enabled: false,
                    provider: None,
                    base_url: None,
                },
            )
        })
        .collect()
}
