import { useState } from 'react'
import { CAPABILITIES, type CapabilityId, type ServiceConfig } from '@galley/api-client'
import { useApiConfig } from '@/api/config'
import {
  authCategoryForProvider,
  type AuthCategory,
  type PluginManifest,
} from '@/api/pluginRegistry'
import { SettingsSection } from '../SettingsSection'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { EntryCard } from '../EntryCard'
import { ToggleField } from '../fields/ToggleField'
import { TextField } from '../fields/TextField'
import { SecretField } from '../fields/SecretField'
import { SelectField } from '../fields/SelectField'
import { ActionField } from '../fields/ActionField'

const SLOT_NUMERALS = ['01', '02', '03', '04', '05', '06', '07', '08']

const PROVIDER_OPTIONS_BY_CAPABILITY: Record<
  CapabilityId,
  readonly { value: string; label: string }[]
> = {
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
  llm: [
    { value: 'anthropic-claude', label: 'Anthropic Claude' },
    { value: 'openai-gpt', label: 'OpenAI GPT' },
    { value: 'google-gemini', label: 'Google Gemini' },
    { value: 'custom', label: 'Custom' },
  ],
}

/**
 * Reference settings section. Each slot renders as a numbered entry
 * (01, 02, …) with a monospaced slot id, italic provider name, and
 * the shallow-then-advanced field stack.
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
      numeral="III"
      description="Capability slots route inference work to specific workers. Each slot's URL points at a TTS, STT, image, or music service reachable from this machine — typically a Tailscale hostname for a GPU host elsewhere on the tailnet."
      scope="environment"
    >
      <div>
        {CAPABILITIES.map((capability, i) => (
          <ServiceSlotCard
            key={capability}
            numeral={SLOT_NUMERALS[i] ?? String(i + 1)}
            capability={capability}
            slot={services[capability]}
            onChange={(patch) => setService(capability, patch)}
          />
        ))}
      </div>

      <div className="gs-ornament" aria-hidden="true">
        <span className="gs-ornament-mark">❦</span>
      </div>

      <AdvancedDisclosure
        label="show shared-default fallback"
        expandedLabel="hide shared-default fallback"
      >
        <p className="gs-field-helper" style={{ marginTop: 0 }}>
          Single-machine deployments may leave individual slot URLs
          empty and rely on this shared default — every empty slot
          falls back to the base URL and bearer token below. Editing
          here affects every slot that doesn't have its own URL set.
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
  numeral: string
  capability: CapabilityId
  slot: ServiceConfig
  onChange: (patch: Partial<ServiceConfig>) => void
}

function ServiceSlotCard({ numeral, capability, slot, onChange }: ServiceSlotCardProps) {
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
        headers: slot.apiKey
          ? { Authorization: `Bearer ${slot.apiKey}` }
          : undefined,
      })
      if (res.ok) {
        setTestKind('success')
        setTestResult(`reachable · ${res.status}`)
      } else {
        setTestKind('error')
        setTestResult(`${res.status} ${res.statusText}`)
      }
    } catch (e) {
      setTestKind('error')
      setTestResult(`unreachable — ${(e as Error).message}`)
    }
  }

  return (
    <EntryCard
      numeral={numeral}
      title={capability}
      titleVariant="mono"
      subtitle={slot.provider || 'unconfigured'}
    >
      <ToggleField
        label="Enabled"
        value={slot.enabled}
        onChange={(enabled) => onChange({ enabled })}
        helperText="When off, galley hides UI actions that require this capability."
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
        emphasis="vermilion"
      />
      <AdvancedDisclosure>
        <AuthField
          provider={slot.provider || ''}
          apiKey={slot.apiKey}
          onApiKeyChange={(apiKey) => onChange({ apiKey })}
        />
        <TextField
          label="Flavor"
          value={slot.flavor ?? ''}
          onChange={(flavor) => onChange({ flavor })}
          placeholder="standard"
          helperText="API-shape hint for clients adapting to non-canonical upstream APIs. Set to 'kokoro-local' for Kokoro-FastAPI; leave empty otherwise."
        />
        <TextField
          label="Local launch command"
          value={slot.localCommand ?? ''}
          onChange={(localCommand) => onChange({ localCommand })}
          placeholder="cd ~/Projects/Kokoro-FastAPI && ./start-cpu.sh"
          helperText="When this worker runs on this machine, the galley desktop tray uses this to Start / Stop / Restart it. Leave empty for remote workers (probe-only). Runs through your default shell."
          showOptional
        />
      </AdvancedDisclosure>
    </EntryCard>
  )
}

/**
 * Auth field rendered inside a slot's AdvancedDisclosure. Branches on the
 * selected provider's manifest:
 *
 *   - `api-key` (bearer / api-key-header / query-param) → existing
 *     SecretField. Today's 8 cloud plugins all hit this path.
 *   - `oauth` (oauth2 / oidc) → "Sign in with <provider>" stubbed button +
 *     a status pill + read-only scopes list. The actual OAuth runtime
 *     (loopback listener, PKCE, keychain) lands in Phase 2.
 *   - `mtls` → read-only note; configuration deferred.
 *   - `none` → hidden (local workers, anonymous endpoints).
 *   - `unknown` (manifest not found, e.g. "Custom" provider) → fall back
 *     to the SecretField so users with custom URLs / unrecognised
 *     provider strings still have an auth surface.
 */
function AuthField({
  provider,
  apiKey,
  onApiKeyChange,
}: {
  provider: string
  apiKey: string
  onApiKeyChange: (val: string) => void
}) {
  const { category, manifest } = authCategoryForProvider(provider)

  if (category === 'oauth') {
    return <OAuthAuthField manifest={manifest!} />
  }

  if (category === 'mtls') {
    return <MtlsAuthField manifest={manifest!} />
  }

  if (category === 'none') {
    return (
      <p className="gs-field-helper" style={{ marginTop: 0 }}>
        No authentication required. Local workers and anonymous endpoints
        skip this field.
      </p>
    )
  }

  // `api-key` and `unknown` → SecretField. The legacy "Custom" sentinel
  // and any provider not yet in the registry land in `unknown`.
  return (
    <SecretField
      label={apiKeyFieldLabel(category, manifest)}
      value={apiKey}
      onChange={onApiKeyChange}
      helperText={apiKeyHelperText(category, manifest)}
    />
  )
}

function apiKeyFieldLabel(
  category: AuthCategory,
  manifest: PluginManifest | null,
): string {
  if (category === 'api-key' && manifest?.authentication?.type === 'api-key-header') {
    const header = manifest.authentication.header
    return header ? `API key (${header})` : 'API key'
  }
  return 'API key (bearer token)'
}

function apiKeyHelperText(
  category: AuthCategory,
  manifest: PluginManifest | null,
): string {
  if (category !== 'api-key' || !manifest?.authentication) {
    return 'Sent as Authorization: Bearer. Empty if the worker requires no auth.'
  }
  const a = manifest.authentication
  const console = a.consoleUrl ?? a.signupUrl
  const where = console ? ` Mint a key at ${console}.` : ''
  if (a.type === 'api-key-header' && a.header) {
    return `Sent as ${a.header} header.${where}`
  }
  if (a.type === 'query-param' && a.queryParam) {
    return `Sent as ?${a.queryParam}=… query parameter.${where}`
  }
  return `Sent as Authorization: Bearer.${where}`
}

/**
 * Phase 1 stub. The button click is wired in Phase 2 (Tauri-side OAuth
 * runtime). Today it surfaces the auth shape so users can verify the
 * manifest is correct and understand what the flow will do.
 */
function OAuthAuthField({ manifest }: { manifest: PluginManifest }) {
  const oauth = manifest.authentication?.oauth
  const mfa = manifest.authentication?.mfa
  const providerLabel = oauth?.provider ?? 'provider'
  const flowLabel =
    oauth?.flow === 'device-code'
      ? 'Device-code flow'
      : oauth?.flow === 'client-credentials'
        ? 'Client-credentials flow'
        : 'Authorization-code with PKCE'

  return (
    <div className="gs-oauth-block">
      <button
        type="button"
        className="gs-oauth-signin"
        disabled
        title="OAuth runtime ships in Phase 2 of the auth-taxonomy workstream."
      >
        Sign in with {providerLabel}
      </button>
      <p className="gs-field-helper" style={{ marginTop: '0.4rem' }}>
        {flowLabel}. Token will land in the OS keychain (
        {oauth?.tokenStorage ?? 'keychain'}).
        {oauth?.scopes?.length
          ? ` Scopes: ${oauth.scopes.join(', ')}.`
          : ''}
        {mfa?.providerEnforced
          ? ` ${manifest.name} enforces 2FA at the provider; the IdP will challenge during sign-in.`
          : ''}
      </p>
      <p className="gs-field-helper" style={{ marginTop: '0.2rem', opacity: 0.7 }}>
        Sign-in is staged — the OAuth runtime ships in the next phase.
      </p>
    </div>
  )
}

function MtlsAuthField({ manifest }: { manifest: PluginManifest }) {
  return (
    <p className="gs-field-helper" style={{ marginTop: 0 }}>
      {manifest.name} uses mTLS. Galley honours the system trust store;
      per-slot client-certificate configuration is reserved for a future
      phase.
    </p>
  )
}
