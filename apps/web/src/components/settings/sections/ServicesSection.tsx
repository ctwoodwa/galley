import { useState } from 'react'
import { CAPABILITIES, type CapabilityId } from '@galley/api-client'
import { useApiConfig } from '@/api/config'
import { SettingsSection } from '../SettingsSection'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { ToggleField } from '../fields/ToggleField'
import { TextField } from '../fields/TextField'
import { SecretField } from '../fields/SecretField'
import { SelectField } from '../fields/SelectField'
import { ActionField } from '../fields/ActionField'

/**
 * Reference settings section — exercises every primitive in the
 * settings/ folder. Each capability slot renders as a card with
 * shallow fields (provider label, baseUrl, enabled toggle, Test
 * button) and an inline advanced disclosure for the apiKey and
 * flavor. The shared-default fallback (the legacy single baseUrl +
 * apiKey) lives at the bottom in its own advanced group.
 */
export function ServicesSection() {
  const services = useApiConfig((s) => s.services)
  const sharedBaseUrl = useApiConfig((s) => s.baseUrl)
  const sharedApiKey = useApiConfig((s) => s.apiKey)
  const setService = useApiConfig((s) => s.setService)
  const setBaseUrl = useApiConfig((s) => s.setBaseUrl)
  const setApiKey = useApiConfig((s) => s.setApiKey)

  return (
    <SettingsSection
      title="Services"
      description="Capability slots — galley apps route inference work to specific workers. Each slot's URL points at a TTS / STT / image / music service reachable from this machine; with Tailscale, that's typically a hostname on your tailnet."
      scope="environment"
    >
      <div className="space-y-4">
        {CAPABILITIES.map((capability) => (
          <ServiceSlotCard
            key={capability}
            capability={capability}
            slot={services[capability]}
            onChange={(patch) => setService(capability, patch)}
          />
        ))}
      </div>
      <AdvancedDisclosure label="Show shared-default fallback" expandedLabel="Hide shared-default fallback">
        <p className="text-xs text-muted-foreground">
          Single-machine deployments can leave individual slot URLs empty and rely
          on this shared default — every empty slot falls back to this base URL +
          token. Editing here affects every slot that doesn't have its own URL set.
        </p>
        <TextField
          label="Shared base URL"
          value={sharedBaseUrl}
          onChange={setBaseUrl}
          inputType="url"
          placeholder="http://localhost:8881"
          helperText="Used when an individual slot's Base URL is empty."
        />
        <SecretField
          label="Shared bearer token"
          value={sharedApiKey}
          onChange={setApiKey}
          helperText="Sent as Authorization: Bearer header to the shared default URL."
        />
      </AdvancedDisclosure>
    </SettingsSection>
  )
}

interface ServiceSlotCardProps {
  capability: CapabilityId
  slot: import('@galley/api-client').ServiceConfig
  onChange: (patch: Partial<import('@galley/api-client').ServiceConfig>) => void
}

const PROVIDER_OPTIONS_BY_CAPABILITY: Record<CapabilityId, readonly { value: string; label: string }[]> = {
  'tts/fast': [
    { value: 'kokoro-fastapi', label: 'Kokoro-FastAPI' },
    { value: 'piper', label: 'Piper' },
    { value: 'edge-tts', label: 'edge-tts' },
    { value: 'custom', label: 'Custom' },
  ],
  'tts/quality': [
    { value: 'higgs-audio', label: 'higgs-audio' },
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'openai', label: 'OpenAI Speech' },
    { value: 'custom', label: 'Custom' },
  ],
  'stt/fast': [
    { value: 'faster-whisper', label: 'Faster-Whisper (small)' },
    { value: 'whisper.cpp', label: 'whisper.cpp' },
    { value: 'custom', label: 'Custom' },
  ],
  'stt/quality': [
    { value: 'faster-whisper-large', label: 'Faster-Whisper (large-v3)' },
    { value: 'parakeet', label: 'Parakeet' },
    { value: 'custom', label: 'Custom' },
  ],
  image: [
    { value: 'comfyui', label: 'ComfyUI' },
    { value: 'sdnext', label: 'SDNext' },
    { value: 'custom', label: 'Custom' },
  ],
  music: [
    { value: 'higgs-audio', label: 'higgs-audio music' },
    { value: 'musicgen', label: 'MusicGen' },
    { value: 'custom', label: 'Custom' },
  ],
}

function ServiceSlotCard({ capability, slot, onChange }: ServiceSlotCardProps) {
  const [urlError, setUrlError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testKind, setTestKind] = useState<'success' | 'error' | 'info'>('info')

  const onUrlChange = (val: string) => {
    onChange({ baseUrl: val })
    if (!val) {
      setUrlError(null)
      return
    }
    try {
      new URL(val)
      setUrlError(null)
    } catch {
      setUrlError('Not a valid URL.')
    }
  }

  const onTest = async () => {
    setTestResult(null)
    if (!slot.baseUrl) {
      setTestKind('error')
      setTestResult('No base URL configured.')
      return
    }
    try {
      const res = await fetch(`${slot.baseUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        headers: slot.apiKey ? { Authorization: `Bearer ${slot.apiKey}` } : undefined,
      })
      if (res.ok) {
        setTestKind('success')
        setTestResult(`Reachable — ${res.status}`)
      } else {
        setTestKind('error')
        setTestResult(`${res.status} ${res.statusText}`)
      }
    } catch (e) {
      setTestKind('error')
      setTestResult(`Unreachable — ${(e as Error).message}`)
    }
  }

  return (
    <div className="rounded border border-border p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-mono font-semibold">{capability}</h2>
        <span className="text-xs text-muted-foreground">
          {slot.provider || 'unconfigured'}
        </span>
      </div>
      <ToggleField
        label="Enabled"
        value={slot.enabled}
        onChange={(enabled) => onChange({ enabled })}
        helperText="When disabled, galley hides UI actions that require this capability."
      />
      <SelectField
        label="Provider"
        value={slot.provider || ''}
        onChange={(provider) => onChange({ provider })}
        options={[
          { value: '', label: '— select —' },
          ...PROVIDER_OPTIONS_BY_CAPABILITY[capability],
        ]}
        helperText="Informational label — galley does not branch on this."
      />
      <TextField
        label="Base URL"
        value={slot.baseUrl}
        onChange={onUrlChange}
        inputType="url"
        placeholder="http://windows-box.tailnet.ts.net:8880"
        error={urlError}
        helperText="Leave empty to fall back to the shared default below."
      />
      <ActionField
        label="Test connection"
        description="GET /health on the configured base URL."
        buttonLabel="Test"
        onClick={onTest}
        resultMessage={testResult}
        resultKind={testKind}
        disabled={!slot.baseUrl}
      />
      <AdvancedDisclosure>
        <SecretField
          label="API key (bearer token)"
          value={slot.apiKey}
          onChange={(apiKey) => onChange({ apiKey })}
          helperText="Sent as Authorization: Bearer. Empty if the worker doesn't require auth."
        />
        <TextField
          label="Flavor"
          value={slot.flavor ?? ''}
          onChange={(flavor) => onChange({ flavor })}
          placeholder="standard"
          helperText="API-shape hint for clients adapting to non-canonical upstream APIs. Set to 'kokoro-local' for Kokoro-FastAPI's OpenAI-compatible Speech endpoint; leave empty otherwise."
        />
      </AdvancedDisclosure>
    </div>
  )
}
