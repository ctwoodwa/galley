/**
 * Desktop-shell integration.
 *
 * When the React app runs inside the Tauri desktop shell, the tray
 * emits typed events to drive navigation and surface service status.
 * This module wires those events into react-router + a tiny event
 * bus consumed by the UI.
 *
 * In a browser context the imports of `@tauri-apps/api/*` resolve at
 * build time; the `isTauri()` guard ensures the listeners only fire
 * when the shell is actually present. Plain web sessions are unaffected.
 */

import type { NavigateFunction } from 'react-router-dom'

const NAVIGATE_EVENT = 'galley://navigate'
const SERVICE_STATUS_EVENT = 'galley://service-status'
const PROBE_UPDATE_EVENT = 'galley://probe-update'
const MEASURE_RESULT_EVENT = 'galley://measure-result'
const MEASURE_ERROR_EVENT = 'galley://measure-error'

interface NavigatePayload {
  path: string
}

/** Cheap detection — Tauri injects `__TAURI_INTERNALS__` into window. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Mount tray-event listeners. Call once from app bootstrap. The
 * caller supplies react-router's `navigate` so this module doesn't
 * import the router (keeps the dependency one-way).
 *
 * Returns an unmount function for HMR / testing.
 */
export async function mountDesktopIntegration(
  navigate: NavigateFunction,
): Promise<() => void> {
  if (!isTauri()) {
    return () => {}
  }
  const { listen } = await import('@tauri-apps/api/event')

  const unlisteners: Array<() => void> = []
  unlisteners.push(
    await listen<NavigatePayload>(NAVIGATE_EVENT, (event) => {
      const { path } = event.payload
      if (typeof path === 'string' && path.startsWith('/')) {
        navigate(path)
      }
    }),
  )
  unlisteners.push(
    await listen<string>(SERVICE_STATUS_EVENT, (event) => {
      window.dispatchEvent(
        new CustomEvent('galley:service-status', { detail: event.payload }),
      )
    }),
  )
  unlisteners.push(
    await listen<unknown>(PROBE_UPDATE_EVENT, (event) => {
      window.dispatchEvent(
        new CustomEvent('galley:probe-update', { detail: event.payload }),
      )
    }),
  )
  unlisteners.push(
    await listen<string>(MEASURE_RESULT_EVENT, (event) => {
      try {
        const parsed = JSON.parse(event.payload)
        window.dispatchEvent(
          new CustomEvent('galley:measure-result', { detail: parsed }),
        )
      } catch {
        window.dispatchEvent(
          new CustomEvent('galley:measure-error', {
            detail: 'Failed to parse measurement output',
          }),
        )
      }
    }),
  )
  unlisteners.push(
    await listen<string>(MEASURE_ERROR_EVENT, (event) => {
      window.dispatchEvent(
        new CustomEvent('galley:measure-error', { detail: event.payload }),
      )
    }),
  )

  return () => {
    unlisteners.forEach((u) => u())
  }
}
