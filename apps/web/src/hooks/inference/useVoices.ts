import { useState, useEffect, useCallback } from 'react'
import type { TTSClient, VoiceInfo } from '@galley/api-client'

export function useVoices(client: TTSClient, model?: string) {
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(null)
      try {
        const data = await client.listVoices(refresh, model)
        setVoices(data.voices)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [client, model],
  )

  useEffect(() => {
    void load()
  }, [load])

  return { voices, loading, error, refresh: () => void load(true) }
}
