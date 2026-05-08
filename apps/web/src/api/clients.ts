import { useMemo } from 'react'
import { TTSClient, ImageClient, MusicClient, SttClient } from '@galley/api-client'
import { useApiConfig } from './config'

/**
 * React hooks that produce a memoized client instance for the current
 * baseUrl + apiKey from the config store. Re-creates only when config changes.
 */

export function useTTSClient() {
  const baseUrl = useApiConfig((s) => s.baseUrl)
  const apiKey = useApiConfig((s) => s.apiKey)
  return useMemo(() => new TTSClient(baseUrl, apiKey), [baseUrl, apiKey])
}

export function useImageClient() {
  const baseUrl = useApiConfig((s) => s.baseUrl)
  const apiKey = useApiConfig((s) => s.apiKey)
  return useMemo(() => new ImageClient(baseUrl, apiKey), [baseUrl, apiKey])
}

export function useMusicClient() {
  const baseUrl = useApiConfig((s) => s.baseUrl)
  const apiKey = useApiConfig((s) => s.apiKey)
  return useMemo(() => new MusicClient(baseUrl, apiKey), [baseUrl, apiKey])
}

export function useSttClient() {
  const baseUrl = useApiConfig((s) => s.baseUrl)
  const apiKey = useApiConfig((s) => s.apiKey)
  return useMemo(() => new SttClient(baseUrl, apiKey), [baseUrl, apiKey])
}
