import { useTTSClient } from '@/api/clients'
import { useHealth } from '@/api/useHealth'
import { TTSPanel } from '@/components/inference/TTSPanel'

export default function VoicesPage() {
  const client = useTTSClient()
  const { status } = useHealth()
  return <TTSPanel client={client} serverReachable={status !== 'error'} />
}
