import { useQuery } from '@tanstack/react-query'
import type { HealthResponse } from '@galley/api-client'
import { useTTSClient } from './clients'

export type HealthStatus = 'loading' | 'ok' | 'warming' | 'error'

interface UseHealthResult {
  health: HealthResponse | null
  status: HealthStatus
  isFetching: boolean
}

/**
 * Polls /api/v1/health every 30s via TanStack Query. Replaces inference-studio's
 * hand-rolled setInterval pattern with proper cache, retry, and stale handling.
 */
export function useHealth(): UseHealthResult {
  const client = useTTSClient()

  const query = useQuery<HealthResponse, Error>({
    queryKey: ['health', client.baseUrl],
    queryFn: () => client.health(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
    staleTime: 15_000,
  })

  const status: HealthStatus = query.isLoading
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data?.model_loaded
        ? 'ok'
        : 'warming'

  return {
    health: query.data ?? null,
    status,
    isFetching: query.isFetching,
  }
}
