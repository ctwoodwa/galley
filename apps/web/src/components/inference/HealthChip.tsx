import type { HealthStatus } from '@/api/useHealth'
import type { HealthResponse } from '@galley/api-client'

interface HealthChipProps {
  status: HealthStatus
  health: HealthResponse | null
}

const DOT: Record<HealthStatus, string> = {
  loading: 'bg-stone-500',
  ok:      'bg-green-400',
  warming: 'bg-yellow-400',
  error:   'bg-red-400',
}
const LABEL: Record<HealthStatus, string> = {
  loading: 'connecting…',
  ok:      'ready',
  warming: 'warming up',
  error:   'unreachable',
}

export function HealthChip({ status, health }: HealthChipProps) {
  const tooltip = health
    ? `queue: ${health.queue_depth} | vram: ${health.vram_used_gb != null ? health.vram_used_gb.toFixed(1) : '–'} GB | model_loaded: ${health.model_loaded}`
    : 'Server unreachable'

  return (
    <div
      title={tooltip}
      aria-label={tooltip}
      tabIndex={0}
      role="status"
      className="flex items-center gap-1.5 cursor-default select-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 rounded"
    >
      <span
        aria-hidden="true"
        className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[status]} ${status === 'ok' ? 'shadow-[0_0_6px_currentColor]' : ''}`}
      />
      <span className="text-sm text-stone-400">{LABEL[status]}</span>
    </div>
  )
}
