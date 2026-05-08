import { useRef, useState } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import { useResizable } from '@/hooks/inference/useResizable'
import { useImageClient } from '@/api/clients'
import type { GeneratedImage, ImageGenerateParams } from '@galley/api-client'

interface SavedPrompt {
  id: string
  text: string
  savedAt: number
}

const SIZE_PRESETS = [
  { label: '512²',   width: 512,  height: 512  },
  { label: '768²',   width: 768,  height: 768  },
  { label: '↔ 768×512', width: 768, height: 512 },
  { label: '↕ 512×768', width: 512, height: 768 },
  { label: '1024²',  width: 1024, height: 1024 },
] as const

export function ImagePanel() {
  const client = useImageClient()

  const [prompt, setPrompt] = useLocalStorage('is.image.prompt', '')
  const [sizePreset, setSizePreset] = useLocalStorage('is.image.preset', 0)
  const [steps, setSteps] = useLocalStorage('is.image.steps', 4)
  const [seed, setSeed] = useState(-1)
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useLocalStorage<GeneratedImage[]>('is.image.history', [])
  const [current, setCurrent] = useState<GeneratedImage | null>(() => {
    try {
      const s = localStorage.getItem('is.image.history')
      const h = s ? (JSON.parse(s) as GeneratedImage[]) : []
      return h[0] ?? null
    } catch { return null }
  })

  const [savedPrompts, setSavedPrompts] = useLocalStorage<SavedPrompt[]>('is.image.saved-prompts', [])

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const preset = SIZE_PRESETS[sizePreset]

  function savePrompt() {
    const text = prompt.trim()
    if (!text) return
    if (savedPrompts.some(p => p.text === text)) return
    setSavedPrompts(prev => [{ id: Date.now().toString(), text, savedAt: Date.now() }, ...prev.slice(0, 49)])
  }

  function deletePrompt(id: string) {
    setSavedPrompts(prev => prev.filter(p => p.id !== id))
  }

  function shuffleSeed() { setSeed(Math.floor(Math.random() * 2 ** 32)) }
  function clearSeed() { setSeed(-1) }

  async function generate() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(null)
    setElapsed(0)

    const start = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)

    const params: ImageGenerateParams = {
      prompt: prompt.trim(),
      width: preset.width,
      height: preset.height,
      steps,
      seed,
    }

    try {
      const { prompt_id } = await client.generate(params)
      const result = await client.waitForCompletion(prompt_id)
      const url = client.viewUrl(result.filename, result.subfolder)
      const img: GeneratedImage = {
        url,
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        timestamp: Date.now(),
      }
      setCurrent(img)
      setHistory((prev) => [img, ...prev.filter(h => h.timestamp !== img.timestamp).slice(0, 49)])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      setGenerating(false)
    }
  }

  const trackFill = `linear-gradient(to right, #0d9488 ${((steps - 1) / 19) * 100}%, #44403c ${((steps - 1) / 19) * 100}%)`

  const { width: panelWidth, onMouseDown: panelResizeMouseDown } = useResizable('is.image.panel.width', { min: 220, max: 520, defaultWidth: 300 })
  const [isPanelResizing, setIsPanelResizing] = useState(false)

  function handlePanelResizeStart(e: React.MouseEvent) {
    setIsPanelResizing(true)
    panelResizeMouseDown(e)
    function onUp() {
      setIsPanelResizing(false)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Controls ── */}
      <div className="flex flex-col flex-shrink-0 border-stone-800 bg-stone-900" style={{ width: panelWidth }}>

        <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <span className="text-xs font-medium tracking-wider uppercase text-stone-400">Image Generation</span>
          </div>
          <span className="text-[10px] text-stone-600 font-mono">FLUX.1-schnell</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-stone-500 mb-2">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void generate() }}
              placeholder="Describe the image you want to create…"
              rows={5}
              className="w-full px-3 py-2.5 text-sm bg-stone-800 border border-stone-700 rounded text-stone-200 placeholder:text-stone-600 resize-none focus:outline-none focus:border-teal-500 transition-colors leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-stone-600">{prompt.length} chars</span>
              <button
                type="button"
                onClick={savePrompt}
                disabled={!prompt.trim() || savedPrompts.some(p => p.text === prompt.trim())}
                className="text-[11px] px-2 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-500 hover:text-teal-400 hover:border-teal-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
          </div>

          {/* Saved prompts */}
          {savedPrompts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium tracking-wider uppercase text-stone-500">Saved</span>
                <button
                  type="button"
                  onClick={() => setSavedPrompts([])}
                  className="text-[10px] text-stone-600 hover:text-stone-400 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {savedPrompts.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 group px-2.5 py-1.5 rounded bg-stone-800/60 border border-stone-700/60 hover:border-stone-600 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setPrompt(p.text)}
                      title={p.text}
                      className="flex-1 text-left text-[12px] text-stone-400 group-hover:text-stone-200 truncate transition-colors leading-snug"
                    >
                      {p.text.length > 60 ? p.text.slice(0, 60) + '…' : p.text}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePrompt(p.id)}
                      className="flex-shrink-0 text-stone-600 hover:text-red-400 transition-colors text-sm leading-none opacity-0 group-hover:opacity-100"
                      aria-label="Delete saved prompt"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Size presets */}
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-stone-500 mb-2">Size</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SIZE_PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSizePreset(i)}
                  className={`px-1.5 py-1.5 text-xs rounded transition-all text-center ${
                    sizePreset === i
                      ? 'bg-teal-600/20 border border-teal-500 text-teal-300'
                      : 'bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-600'
                  }`}
                >
                  <span className="block font-medium leading-tight">{p.label}</span>
                  <span className="block text-[10px] opacity-50 mt-0.5 font-mono">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium tracking-wider uppercase text-stone-500">Steps</label>
              <span className="text-xs font-mono text-teal-400">{steps}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full range-teal"
              style={{ background: trackFill }}
            />
            <div className="flex justify-between mt-1 text-[10px] text-stone-600">
              <span>fast ·4</span>
              <span>quality ·8+</span>
            </div>
          </div>

          {/* Seed */}
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-stone-500 mb-2">Seed</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={seed < 0 ? '' : seed}
                onChange={(e) => setSeed(e.target.value === '' ? -1 : Number(e.target.value))}
                placeholder="Random"
                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-mono bg-stone-800 border border-stone-700 rounded text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-teal-500 transition-colors"
              />
              <button
                type="button"
                onClick={seed < 0 ? shuffleSeed : clearSeed}
                title={seed < 0 ? 'Fix a random seed' : 'Switch to random seed'}
                className="px-2.5 py-1.5 text-base bg-stone-800 border border-stone-700 rounded text-stone-400 hover:text-stone-200 hover:border-stone-600 transition-colors leading-none"
              >
                {seed < 0 ? '⚄' : '↺'}
              </button>
            </div>
            {seed < 0 && (
              <p className="mt-1 text-[11px] text-stone-600">Random seed each run</p>
            )}
          </div>
        </div>

        {/* Generate */}
        <div className="p-4 border-t border-stone-800 flex-shrink-0">
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-950/50 border border-red-900/60 rounded text-xs text-red-400 leading-relaxed break-words">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!prompt.trim() || generating}
            className={`w-full py-3 rounded text-sm font-semibold tracking-wide transition-all ${
              generating
                ? 'bg-teal-900/40 border border-teal-800/60 text-teal-400 cursor-wait'
                : !prompt.trim()
                ? 'bg-stone-800 border border-stone-700 text-stone-600 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-500 text-stone-950 shadow-lg shadow-teal-900/20 hover:shadow-teal-800/30'
            }`}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                Generating… {elapsed}s
              </span>
            ) : (
              'Generate'
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-stone-600">Ctrl+Enter in prompt to run</p>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handlePanelResizeStart}
        title="Drag to resize"
        className="relative flex-shrink-0 w-2 cursor-col-resize group select-none z-10"
      >
        <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ${
          isPanelResizing ? 'bg-teal-500' : 'bg-stone-800 group-hover:bg-teal-500/50'
        }`} />
      </div>

      {/* ── Output canvas ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-stone-950">
        <div
          className="flex-1 flex items-center justify-center overflow-hidden relative"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(20,184,166,0.055) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        >
          {/* Empty state */}
          {!current && !generating && (
            <div className="text-center select-none">
              <svg
                width="64" height="64" viewBox="0 0 64 64" fill="none"
                className="mx-auto mb-4 opacity-10 text-teal-400"
              >
                <rect x="4" y="4" width="56" height="56" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
                <circle cx="20" cy="20" r="5" fill="currentColor" opacity="0.6" />
                <path d="M4 44l16-12 10 10 14-16 20 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-stone-600 text-sm font-medium">No image yet</p>
              <p className="text-stone-700 text-xs mt-1">Write a prompt and click Generate</p>
            </div>
          )}

          {/* Generating (no existing image) */}
          {generating && !current && (
            <div className="text-center select-none">
              <div className="relative mx-auto mb-6" style={{ width: 80, height: 80 }}>
                <div className="absolute inset-0 border-2 border-teal-800/60 rounded-full animate-ping" style={{ animationDuration: '1.6s' }} />
                <div className="absolute inset-3 border-2 border-teal-700/40 rounded-full animate-ping" style={{ animationDuration: '1.6s', animationDelay: '0.3s' }} />
                <div className="absolute inset-5 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
              </div>
              <p className="text-teal-400 text-sm font-medium">Generating…</p>
              <p className="text-stone-600 text-xs mt-1">{elapsed}s · {preset.width}×{preset.height} · {steps} steps</p>
            </div>
          )}

          {/* Image (with optional generating overlay) */}
          {current && (
            <div className="relative max-w-full max-h-full p-6 flex items-center justify-center">
              {generating && (
                <div className="absolute inset-6 bg-stone-950/75 flex flex-col items-center justify-center z-10 rounded backdrop-blur-sm">
                  <div className="inline-block w-6 h-6 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin mb-2" />
                  <p className="text-teal-400 text-xs">{elapsed}s · rendering new image…</p>
                </div>
              )}
              <img
                src={current.url}
                alt={current.prompt}
                className="max-w-full object-contain rounded shadow-2xl shadow-black/60"
                style={{ maxHeight: 'calc(100vh - 200px)' }}
              />
            </div>
          )}
        </div>

        {/* History strip */}
        {history.length > 0 && (
          <div className="flex-shrink-0 border-t border-stone-800 bg-stone-900 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium tracking-wider uppercase text-stone-600">
                History · {history.length}
              </span>
              <button
                type="button"
                onClick={() => { setHistory([]); setCurrent(null) }}
                className="text-[10px] text-stone-600 hover:text-stone-400 transition-colors px-1.5 py-0.5 rounded hover:bg-stone-800"
              >
                Clear
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {history.map((img) => (
                <button
                  key={img.timestamp}
                  type="button"
                  onClick={() => setCurrent(img)}
                  title={img.prompt}
                  className={`flex-shrink-0 rounded overflow-hidden transition-all duration-150 ${
                    current?.timestamp === img.timestamp
                      ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-stone-900'
                      : 'opacity-50 hover:opacity-90'
                  }`}
                  style={{ width: 52, height: 52 }}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
