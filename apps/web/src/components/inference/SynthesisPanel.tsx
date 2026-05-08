import type { TTSClient, KnobValues, AudioFormat, ModelId } from '@galley/api-client'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import { SingleTab } from './SingleTab'
import { BatchTab } from './BatchTab'

const MODEL_OPTIONS: { id: ModelId; label: string; sub: string }[] = [
  { id: 'higgs', label: 'Chatterbox', sub: 'quality' },
  { id: 'kokoro', label: 'Kokoro', sub: 'fast' },
]

interface SynthesisPanelProps {
  client: TTSClient
  selectedVoice: string
  model: ModelId
  onModelChange: (m: ModelId) => void
  kokoroVoice: string
  knobs: KnobValues
  onKnobsChange: (k: KnobValues) => void
  format: AudioFormat
  onFormatChange: (f: AudioFormat) => void
  serverReachable: boolean
}

type Tab = 'single' | 'batch'

export function SynthesisPanel({
  client, selectedVoice, model, onModelChange, kokoroVoice,
  knobs, onKnobsChange, format, onFormatChange, serverReachable,
}: SynthesisPanelProps) {
  const [tab, setTab] = useLocalStorage<Tab>('is.tts.tab', 'single')

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center border-b border-stone-800 bg-stone-900">
        {(['single', 'batch'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? 'text-amber-300 border-b-2 border-amber-400 bg-stone-950'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {t === 'single' ? 'Single' : 'Batch'}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5 px-4" role="group" aria-label="Engine">
          <span className="text-xs font-medium tracking-wider uppercase text-stone-600 mr-0.5">Engine</span>
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onModelChange(opt.id)}
              aria-pressed={model === opt.id}
              className={`px-2.5 py-1 text-xs rounded transition-all leading-none font-medium ${
                model === opt.id
                  ? 'bg-amber-600 text-stone-950 shadow-sm'
                  : 'bg-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-700 border border-stone-700'
              }`}
            >
              {opt.label}
              <span className={`ml-1 font-normal ${model === opt.id ? 'text-amber-900' : 'text-stone-600'}`}>
                {opt.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'single' ? (
          <SingleTab
            client={client}
            model={model}
            selectedVoice={selectedVoice}
            kokoroVoice={kokoroVoice}
            knobs={knobs}
            onKnobsChange={onKnobsChange}
            format={format}
            onFormatChange={onFormatChange}
            serverReachable={serverReachable}
          />
        ) : (
          <BatchTab
            client={client}
            model={model}
            selectedVoice={selectedVoice}
            kokoroVoice={kokoroVoice}
            knobs={knobs}
            onKnobsChange={onKnobsChange}
            format={format}
            onFormatChange={onFormatChange}
            serverReachable={serverReachable}
          />
        )}
      </div>
    </main>
  )
}
