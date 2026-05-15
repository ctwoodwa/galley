import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  TTSClient,
  type TTSFlavor,
  ImageClient,
  MusicClient,
  SttClient,
  type CapabilityId,
} from '@galley/api-client'
import { useApiConfig, resolveService } from './config'

/**
 * React hooks that produce a memoized client instance for the resolved
 * service slot. Re-creates only when the resolved baseUrl / apiKey /
 * flavor changes.
 *
 * The slot resolver returns `null` when no URL is configured anywhere
 * (slot's own baseUrl is empty AND the shared-default baseUrl is empty,
 * or the slot is explicitly disabled). The hooks construct a client
 * with an empty URL in that case — call sites can detect "no service"
 * via a follow-up `isReady` check or by catching the network error.
 *
 * Per `docs/services/README.md`, tier is a client-side preference;
 * workers don't know about it. The TTS / STT hooks accept a tier
 * argument and route through the appropriate slot.
 */

export type TTSTier = 'fast' | 'quality'
export type SttTier = 'fast' | 'quality'

/**
 * `resolveService` returns a freshly-constructed `{baseUrl, apiKey, flavor}`
 * object on every call. Without `useShallow`, Zustand 5 + React 19 detect
 * this as a snapshot-mismatch on every render and force an infinite
 * re-render loop ("getSnapshot should be cached"). `useShallow` shallow-
 * compares the returned object so identical contents share identity.
 *
 * This loop manifested on /read whenever ChapterView mounted: useDictation
 * → useSttClient → useResolved('stt/fast') → fresh-ref selector → loop.
 */
function useResolved(capability: CapabilityId) {
  return useApiConfig(useShallow((s) => resolveService(s, capability)))
}

export function useTTSClient(tier: TTSTier = 'fast') {
  const resolved = useResolved(`tts/${tier}` as CapabilityId)
  return useMemo(
    () =>
      new TTSClient(
        resolved?.baseUrl ?? '',
        resolved?.apiKey ?? '',
        (resolved?.flavor as TTSFlavor) ?? 'standard',
      ),
    [resolved?.baseUrl, resolved?.apiKey, resolved?.flavor],
  )
}

export function useImageClient() {
  const resolved = useResolved('image')
  return useMemo(
    () => new ImageClient(resolved?.baseUrl ?? '', resolved?.apiKey ?? ''),
    [resolved?.baseUrl, resolved?.apiKey],
  )
}

export function useMusicClient() {
  const resolved = useResolved('music')
  return useMemo(
    () => new MusicClient(resolved?.baseUrl ?? '', resolved?.apiKey ?? ''),
    [resolved?.baseUrl, resolved?.apiKey],
  )
}

export function useSttClient(tier: SttTier = 'fast') {
  const resolved = useResolved(`stt/${tier}` as CapabilityId)
  return useMemo(
    () => new SttClient(resolved?.baseUrl ?? '', resolved?.apiKey ?? ''),
    [resolved?.baseUrl, resolved?.apiKey],
  )
}

/**
 * True iff the named capability slot resolves to a usable worker URL
 * (slot enabled and a baseUrl available, either on the slot or via the
 * shared default).
 */
export function useServiceAvailable(capability: CapabilityId): boolean {
  const resolved = useResolved(capability)
  return Boolean(resolved?.baseUrl)
}
