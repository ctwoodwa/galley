import { useState, useEffect } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import type { TTSClient, KnobValues, AudioFormat, ModelId } from '@galley/api-client'
import { KnobSlider } from './KnobSlider'
import { PresetButtons, PRESETS } from './PresetButtons'
import { WaveformPlayer } from './WaveformPlayer'
import { ErrorBanner } from './ErrorBanner'
import { SampleTextPicker } from './SampleTextPicker'

const PARA_TAG_RE = /\[(laugh|chuckle|sigh|cough|gasp|yawn|breath)\]/i
const DEFAULT_KNOBS = PRESETS['Neutral']
const DEFAULT_FORMAT: AudioFormat = 'mp3'

interface SingleTabProps {
  client: TTSClient
  model: ModelId
  selectedVoice: string
  kokoroVoice: string
  knobs: KnobValues
  onKnobsChange: (k: KnobValues) => void
  format: AudioFormat
  onFormatChange: (f: AudioFormat) => void
  serverReachable: boolean
}

export function SingleTab({
  client, model, selectedVoice, kokoroVoice,
  knobs, onKnobsChange, format, onFormatChange, serverReachable,
}: SingleTabProps) {
  const [input, setInput] = useLocalStorage('is.tts.single.input', '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [pcmUrl, setPcmUrl] = useState<string | null>(null)

  const hasParaTags = PARA_TAG_RE.test(input)
  const charCount = input.length
  const warnLong = charCount > 900
  const canPlay = format !== 'pcm'
  const isKokoro = model === 'kokoro'

  const isKnobsModified = Object.entries(DEFAULT_KNOBS).some(
    ([k, v]) => Math.abs(knobs[k as keyof KnobValues] - v) > 0.001
  )
  const isFormatModified = format !== DEFAULT_FORMAT

  useEffect(() => {
    if (!audioBlob || canPlay) { setPcmUrl(null); return }
    const url = URL.createObjectURL(audioBlob)
    setPcmUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioBlob, canPlay])

  useEffect(() => { setAudioBlob(null); setError(null) }, [model])

  const generate = async () => {
    setError(null)
    setAudioBlob(null)
    setLoading(true)
    try {
      const blob = await client.synthesize({
        model,
        input,
        voice: isKokoro ? kokoroVoice : selectedVoice,
        response_format: format,
        speed: knobs.speed !== 1.0 ? knobs.speed : undefined,
        ...(isKokoro ? {} : {
          exaggeration: knobs.exaggeration,
          cfg_weight: knobs.cfg_weight,
          temperature: knobs.temperature,
        }),
      })
      setAudioBlob(blob)
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      if (status === 401) setError('Invalid API key — check the key in the header bar')
      else if (status === 404) setError('Voice not found — refresh the voice list')
      else if (status === 503) setError('Server queue full — retry in a moment')
      else if (status === 500) setError('Server error — check server logs')
      else setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {hasParaTags && !isKokoro && (
        <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/40 text-yellow-200 rounded-lg px-3 py-2.5 text-sm">
          Paralinguistic tags like [laugh] are not supported on this server — strip them or use punctuation for pacing.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <SampleTextPicker onSelect={setInput} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          maxLength={4096}
          placeholder="Enter text to synthesize…"
          className="w-full px-3 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 text-sm resize-y focus:outline-none focus:border-amber-500 placeholder:text-stone-600 transition-colors leading-relaxed"
          aria-label="Text to synthesize"
        />
        <div className="flex justify-between text-xs text-stone-600">
          {warnLong
            ? <span className="text-yellow-400">Long input — quality may drift. Consider the Batch tab.</span>
            : <span />
          }
          <span className={charCount > 3800 ? 'text-red-400' : ''}>{charCount} / 4096</span>
        </div>
      </div>

      {isKokoro ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider uppercase text-stone-500">Speed</span>
            {Math.abs(knobs.speed - 1.0) > 0.001 && (
              <button
                type="button"
                onClick={() => onKnobsChange({ ...knobs, speed: 1.0 })}
                className="text-[10px] font-medium tracking-wider uppercase text-stone-600 hover:text-stone-400 transition-colors"
              >
                ↺ Reset
              </button>
            )}
          </div>
          <KnobSlider label="Speed" value={knobs.speed} min={0.25} max={4.0} step={0.05}
            onChange={(v) => onKnobsChange({ ...knobs, speed: v })} defaultValue={1.0} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider uppercase text-stone-500">Emotion knobs</span>
            <div className="flex items-center gap-3">
              {isKnobsModified && (
                <button
                  type="button"
                  onClick={() => onKnobsChange(DEFAULT_KNOBS)}
                  className="text-[10px] font-medium tracking-wider uppercase text-stone-600 hover:text-stone-400 transition-colors"
                >
                  ↺ Reset
                </button>
              )}
              <PresetButtons onSelect={onKnobsChange} />
            </div>
          </div>
          <KnobSlider label="Exaggeration" value={knobs.exaggeration} min={0} max={1.5} step={0.05}
            onChange={(v) => onKnobsChange({ ...knobs, exaggeration: v })} defaultValue={DEFAULT_KNOBS.exaggeration} />
          <KnobSlider label="CFG Weight" value={knobs.cfg_weight} min={0.1} max={1.0} step={0.05}
            onChange={(v) => onKnobsChange({ ...knobs, cfg_weight: v })} defaultValue={DEFAULT_KNOBS.cfg_weight} />
          <KnobSlider label="Temperature" value={knobs.temperature} min={0} max={2.0} step={0.05}
            onChange={(v) => onKnobsChange({ ...knobs, temperature: v })} defaultValue={DEFAULT_KNOBS.temperature} />
          <KnobSlider label="Speed" value={knobs.speed} min={0.5} max={2.0} step={0.05}
            onChange={(v) => onKnobsChange({ ...knobs, speed: v })} defaultValue={DEFAULT_KNOBS.speed}
            warn={(v) => v < 0.92 || v > 1.08 ? 'Time-stretch sounds artificial outside the natural range' : null} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Response format">
          <span className="text-xs font-medium tracking-wider uppercase text-stone-500 mr-1">Format</span>
          {(['mp3', 'wav', 'flac', 'pcm'] as AudioFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFormatChange(f)}
              aria-pressed={format === f}
              className={`px-3 py-1 text-xs rounded transition-all font-medium ${
                format === f
                  ? 'bg-amber-700 text-stone-100'
                  : 'bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-stone-600'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
          {isFormatModified && (
            <button
              type="button"
              onClick={() => onFormatChange(DEFAULT_FORMAT)}
              title="Reset to MP3"
              className="text-[10px] font-medium tracking-wider uppercase text-stone-600 hover:text-stone-400 transition-colors ml-1"
            >
              ↺
            </button>
          )}
          {!canPlay && <span className="text-xs text-stone-600 ml-1">Raw 24 kHz int16 LE — download only</span>}
        </div>
      </div>

      <button
        onClick={() => void generate()}
        disabled={loading || !input.trim() || !serverReachable}
        title={!serverReachable ? 'Server unreachable — check connection and API key' : undefined}
        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 rounded-lg font-semibold transition-all text-sm shadow-sm"
      >
        {loading
          ? <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-stone-800 border-t-stone-950 animate-spin" />
              Generating…
            </span>
          : canPlay ? 'Generate & Play' : 'Generate & Download'
        }
      </button>

      {audioBlob && canPlay && <WaveformPlayer blob={audioBlob} label={`${format.toUpperCase()} preview`} />}
      {audioBlob && !canPlay && (
        <a
          href={pcmUrl ?? '#'}
          download={`output.${format}`}
          className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
        >
          ↓ Download {format.toUpperCase()}
        </a>
      )}
    </div>
  )
}
