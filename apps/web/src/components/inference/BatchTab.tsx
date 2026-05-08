import { useState, useRef, useEffect } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import type { TTSClient, KnobValues, AudioFormat, ModelId } from '@galley/api-client'
import { splitText, CHUNK_SIZES, type ChunkSize } from '@/lib/inference/chunker'
import { stitchBlobs } from '@/lib/inference/wavStitch'
import { KnobSlider } from './KnobSlider'
import { PresetButtons, PRESETS } from './PresetButtons'
import { ErrorBanner } from './ErrorBanner'
import { SampleTextPicker } from './SampleTextPicker'

const DEFAULT_KNOBS = PRESETS['Neutral']
const DEFAULT_FORMAT: AudioFormat = 'mp3'
const DEFAULT_CHUNK_SIZE: ChunkSize = 'recommended'

interface ChunkResult {
  index: number
  text: string
  status: 'pending' | 'generating' | 'done' | 'failed'
  error?: string
  blob?: Blob
}

interface BatchTabProps {
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

export function BatchTab({
  client, model, selectedVoice, kokoroVoice,
  knobs, onKnobsChange, format, onFormatChange, serverReachable,
}: BatchTabProps) {
  const [input, setInput] = useLocalStorage('is.tts.batch.input', '')
  const [chunkSize, setChunkSize] = useLocalStorage<ChunkSize>('is.tts.batch.chunksize', 'recommended')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ChunkResult[]>([])
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const isKokoro = model === 'kokoro'
  const chunks = splitText(input, CHUNK_SIZES[chunkSize])
  const voice = isKokoro ? kokoroVoice : selectedVoice

  const isKnobsModified = Object.entries(DEFAULT_KNOBS).some(
    ([k, v]) => Math.abs(knobs[k as keyof KnobValues] - v) > 0.001
  )
  const isFormatModified = format !== DEFAULT_FORMAT
  const isChunkSizeModified = chunkSize !== DEFAULT_CHUNK_SIZE

  useEffect(() => {
    if (!outputBlob) { setOutputUrl(null); return }
    const url = URL.createObjectURL(outputBlob)
    setOutputUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [outputBlob])

  const makeSynthArgs = (text: string) => ({
    model,
    input: text,
    voice,
    response_format: format,
    speed: knobs.speed !== 1.0 ? knobs.speed : undefined,
    ...(isKokoro ? {} : {
      exaggeration: knobs.exaggeration,
      cfg_weight: knobs.cfg_weight,
      temperature: knobs.temperature,
    }),
  })

  const generateAll = async () => {
    setError(null)
    setOutputBlob(null)
    abortRef.current = false
    setResults(chunks.map((text, i) => ({ index: i, text, status: 'pending' })))
    setRunning(true)

    const blobs: (Blob | null)[] = new Array(chunks.length).fill(null)

    for (let i = 0; i < chunks.length; i++) {
      if (abortRef.current) break
      setResults((prev) => prev.map((r) => r.index === i ? { ...r, status: 'generating' } : r))

      let blob: Blob | null = null
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          blob = await client.synthesize(makeSynthArgs(chunks[i]))
          break
        } catch (e: unknown) {
          const status = (e as { status?: number }).status
          lastError = String(e)
          if (status === 503 && attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue }
          break
        }
      }

      if (blob) {
        blobs[i] = blob
        setResults((prev) => prev.map((r) => r.index === i ? { ...r, status: 'done', blob } : r))
      } else {
        setResults((prev) => prev.map((r) => r.index === i ? { ...r, status: 'failed', error: lastError } : r))
      }
    }

    const successBlobs = blobs.filter((b): b is Blob => b !== null)
    if (successBlobs.length > 0) setOutputBlob(await stitchBlobs(successBlobs, format))
    setRunning(false)
  }

  const retryChunk = async (index: number) => {
    const chunkText = results.find((r) => r.index === index)?.text ?? chunks[index]
    setResults((prev) => prev.map((r) => r.index === index ? { ...r, status: 'generating', error: undefined } : r))
    try {
      const blob = await client.synthesize(makeSynthArgs(chunkText))
      setResults((prev) => prev.map((r) => r.index === index ? { ...r, status: 'done', blob } : r))
    } catch (e) {
      setResults((prev) => prev.map((r) => r.index === index ? { ...r, status: 'failed', error: String(e) } : r))
    }
  }

  const doneCount = results.filter((r) => r.status === 'done').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-col gap-1.5">
        <SampleTextPicker onSelect={setInput} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          placeholder="Paste long-form text here. It will be split into chunks automatically."
          className="w-full px-3 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 text-sm resize-y focus:outline-none focus:border-amber-500 placeholder:text-stone-600 transition-colors leading-relaxed"
          aria-label="Long-form text to synthesize in batch"
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs font-medium tracking-wider uppercase text-stone-500">Chunk size</span>
        {(Object.keys(CHUNK_SIZES) as ChunkSize[]).map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-sm text-stone-300 cursor-pointer">
            <input type="radio" name="chunkSize" value={key} checked={chunkSize === key}
              onChange={() => setChunkSize(key)} className="accent-amber-400" />
            {key.charAt(0).toUpperCase() + key.slice(1)} (~{CHUNK_SIZES[key]} chars)
          </label>
        ))}
        <span className="text-sm text-amber-400 font-mono ml-1">
          {chunks.length} chunk{chunks.length !== 1 ? 's' : ''}
        </span>
        {isChunkSizeModified && (
          <button
            type="button"
            onClick={() => setChunkSize(DEFAULT_CHUNK_SIZE)}
            title="Reset to recommended"
            className="text-[10px] font-medium tracking-wider uppercase text-stone-600 hover:text-stone-400 transition-colors ml-auto"
          >
            ↺ Reset
          </button>
        )}
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
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void generateAll()}
          disabled={running || chunks.length === 0 || !serverReachable}
          title={!serverReachable ? 'Server unreachable — check connection and API key' : undefined}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 rounded-lg font-semibold transition-all text-sm shadow-sm"
        >
          {running
            ? <span className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-stone-800 border-t-stone-950 animate-spin" />
                {doneCount}/{results.length} chunks
              </span>
            : 'Generate All'
          }
        </button>
        {running && (
          <button
            type="button"
            onClick={() => { abortRef.current = true }}
            className="px-4 py-2.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-sm transition-colors"
          >
            Abort
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {results.length <= 20
            ? results.map((r) => (
                <div key={r.index} className="flex items-center gap-2.5 text-sm py-0.5">
                  <span className={`w-4 text-center font-mono text-xs ${
                    r.status === 'done'       ? 'text-green-400' :
                    r.status === 'failed'     ? 'text-red-400' :
                    r.status === 'generating' ? 'text-amber-400 animate-pulse' : 'text-stone-700'
                  }`}>
                    {r.status === 'done' ? '✓' : r.status === 'failed' ? '✗' : r.status === 'generating' ? '◌' : '·'}
                  </span>
                  <span className="text-stone-500 font-mono text-xs">#{r.index + 1}</span>
                  {r.error && <span className="text-red-400 text-xs truncate flex-1">{r.error}</span>}
                  {r.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => void retryChunk(r.index)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                    >
                      retry
                    </button>
                  )}
                </div>
              ))
            : (
                <div className="text-sm text-stone-400 font-mono">
                  <span className="text-green-400">{doneCount}</span> done ·{' '}
                  <span className="text-red-400">{failedCount}</span> failed ·{' '}
                  <span className="text-stone-500">{results.length - doneCount - failedCount}</span> remaining
                </div>
              )
          }
        </div>
      )}

      {outputUrl && (
        <a
          href={outputUrl}
          download={`batch-output.${format}`}
          className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
        >
          ↓ Download stitched {format.toUpperCase()} ({(outputBlob!.size / 1024).toFixed(0)} KB)
        </a>
      )}
    </div>
  )
}
