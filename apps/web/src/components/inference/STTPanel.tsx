import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import { useResizable } from '@/hooks/inference/useResizable'
import { useApiConfig } from '@/api/config'

const LANGUAGES = [
  { code: 'auto',  label: 'Auto-detect' },
  { code: 'en',    label: 'English' },
  { code: 'fr',    label: 'French' },
  { code: 'de',    label: 'German' },
  { code: 'es',    label: 'Spanish' },
  { code: 'it',    label: 'Italian' },
  { code: 'pt',    label: 'Portuguese' },
  { code: 'zh',    label: 'Chinese' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'ko',    label: 'Korean' },
  { code: 'ru',    label: 'Russian' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'hi',    label: 'Hindi' },
]

interface Transcript {
  id: number
  text: string
  language: string
  duration: number
  recordedAt: number
}

export function STTPanel() {
  const baseUrl = useApiConfig((s) => s.baseUrl)

  const [modelLoaded, setModelLoaded] = useState<boolean | null>(null)
  const [modelName, setModelName] = useState('base')
  const [language, setLanguage] = useLocalStorage('is.stt.language', 'auto')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploadFilename, setUploadFilename] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeRef = useRef('audio/webm')

  // Poll STT model status
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`${baseUrl}/api/v1/audio/stt/status`)
        if (!res.ok) return
        const data = await res.json() as { loaded: boolean; model: string }
        if (!cancelled) {
          setModelLoaded(data.loaded)
          setModelName(data.model)
        }
      } catch {}
    }
    void check()
    const id = setInterval(check, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [baseUrl])

  // Draw idle waveform on canvas mount
  useEffect(() => {
    drawIdle()
  }, [])

  function drawIdle() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const N = 52
    const bw = canvas.width / N
    const mid = canvas.height / 2
    for (let i = 0; i < N; i++) {
      const h = 3 + Math.abs(Math.sin(i * 0.55)) * 8 + Math.abs(Math.sin(i * 1.1)) * 6
      ctx.fillStyle = 'rgba(139,92,246,0.18)'
      const r = Math.min(2, bw / 2 - 0.5)
      roundRect(ctx, i * bw + 1, mid - h / 2, bw - 2, h, r)
      ctx.fill()
    }
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  function startLiveViz(analyser: AnalyserNode) {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const N = 52
    const bufLen = analyser.frequencyBinCount
    const dataArr = new Uint8Array(bufLen)
    const step = Math.max(1, Math.floor(bufLen / N))

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArr)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const bw = canvas.width / N
      const mid = canvas.height / 2
      for (let i = 0; i < N; i++) {
        const val = dataArr[i * step] / 255
        const h = Math.max(4, val * canvas.height * 0.85)
        const alpha = 0.25 + val * 0.75
        ctx.fillStyle = `rgba(139,92,246,${alpha})`
        const r = Math.min(2, bw / 2 - 0.5)
        roundRect(ctx, i * bw + 1, mid - h / 2, bw - 2, h, r)
        ctx.fill()
      }
    }
    draw()
  }

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      // Web Audio analyser for visualization
      const audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      audioCtx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser

      // Determine best MIME
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg;codecs=opus'
      mimeRef.current = mime

      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = handleStop
      recorder.start(100)  // collect chunks every 100ms
      recorderRef.current = recorder

      startLiveViz(analyser)

      // Timer
      setElapsed(0)
      const start = Date.now()
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)

      setRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    cancelAnimationFrame(animRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close()
    recorderRef.current = null
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
    setRecording(false)
    drawIdle()
  }, [])

  const transcribeBlob = useCallback(async (blob: Blob, filename: string, fallbackDuration = 0) => {
    setTranscribing(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', blob, filename)
      fd.append('model', 'whisper-1')
      fd.append('language', language)
      fd.append('response_format', 'verbose_json')

      const res = await fetch(`${baseUrl}/api/v1/audio/transcriptions`, { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status))
        throw new Error(msg)
      }
      const data = await res.json() as { text: string; language: string; duration: number }

      if (data.text) {
        setTranscripts((prev) => [
          {
            id: Date.now(),
            text: data.text,
            language: data.language ?? language,
            duration: data.duration ?? fallbackDuration,
            recordedAt: Date.now(),
          },
          ...prev.slice(0, 19),
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
      setUploadFilename(null)
    }
  }, [baseUrl, language])

  const handleStop = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: mimeRef.current })
    const ext = mimeRef.current.includes('ogg') ? '.ogg' : '.webm'
    await transcribeBlob(blob, `recording${ext}`, elapsed)
  }, [transcribeBlob, elapsed])

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadFilename(file.name)
    await transcribeBlob(file, file.name)
  }, [transcribeBlob])

  // wire up handleStop properly (avoids stale closure from recorder.onstop)
  const handleStopRef = useRef(handleStop)
  useEffect(() => { handleStopRef.current = handleStop }, [handleStop])

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave() { setDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFileUpload(file)
  }
  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFileUpload(file)
    e.target.value = ''
  }

  function copyLatest() {
    const latest = transcripts[0]
    if (!latest) return
    void navigator.clipboard.writeText(latest.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function fmtDuration(s: number) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const latest = transcripts[0]

  const { width: panelWidth, onMouseDown: panelResizeMouseDown } = useResizable('is.stt.panel.width', { min: 220, max: 520, defaultWidth: 300 })
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

      {/* ── Left: controls ── */}
      <div className="flex flex-col flex-shrink-0 border-stone-800 bg-stone-900" style={{ width: panelWidth }}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
              transcribing ? 'bg-violet-400 animate-pulse' :
              recording    ? 'bg-red-400 animate-pulse' :
              modelLoaded  ? 'bg-violet-400' : 'bg-stone-600'
            }`} />
            <span className="text-xs font-medium tracking-wider uppercase text-stone-400">Transcription</span>
          </div>
          <span className="text-[10px] text-stone-600 font-mono">Whisper {modelName}</span>
        </div>

        {/* Waveform canvas */}
        <div className="px-4 pt-5 pb-3">
          <canvas
            ref={canvasRef}
            width={268}
            height={80}
            className="w-full rounded"
            style={{ display: 'block' }}
          />
        </div>

        {/* Language */}
        <div className="px-4 pb-4">
          <label className="block text-xs font-medium tracking-wider uppercase text-stone-500 mb-2">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={recording || transcribing}
            className="w-full px-2.5 py-1.5 text-sm bg-stone-800 border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Record / Stop */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
          {recording ? (
            <>
              <button
                type="button"
                onClick={stopRecording}
                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all shadow-lg shadow-red-900/40 hover:shadow-red-800/50 hover:scale-105"
                aria-label="Stop recording"
              >
                <div className="w-7 h-7 bg-stone-100 rounded-sm" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-sm text-red-400 font-mono font-medium">{fmtDuration(elapsed)}</span>
                <span className="text-xs text-stone-500">recording</span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={transcribing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  transcribing
                    ? 'bg-stone-800 border-2 border-stone-700 text-stone-600 cursor-wait shadow-none'
                    : 'bg-violet-700 hover:bg-violet-600 shadow-violet-900/40 hover:shadow-violet-800/50 hover:scale-105'
                }`}
                aria-label="Start recording"
              >
                {transcribing ? (
                  <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-stone-100">
                    <rect x="8" y="1" width="8" height="13" rx="4" fill="currentColor" />
                    <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 17v3M9.5 20h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <span className="text-xs text-stone-600">
                {transcribing ? (uploadFilename ? `Processing ${uploadFilename}…` : 'Transcribing…') : 'Click to record'}
              </span>
            </>
          )}

          {/* Divider */}
          {!recording && (
            <div className="flex items-center gap-2 w-full mt-1">
              <div className="flex-1 h-px bg-stone-800" />
              <span className="text-[10px] text-stone-700 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-stone-800" />
            </div>
          )}

          {/* File upload drop zone */}
          {!recording && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.webm,.aac,.opus"
                className="hidden"
                onChange={onFileInput}
              />
              <button
                type="button"
                disabled={transcribing}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`w-full py-3 px-3 rounded-lg border border-dashed text-xs transition-all flex flex-col items-center gap-1.5 ${
                  dragging
                    ? 'border-violet-500 bg-violet-950/40 text-violet-300'
                    : transcribing
                    ? 'border-stone-800 text-stone-700 cursor-wait'
                    : 'border-stone-700 text-stone-500 hover:border-violet-700 hover:text-violet-400 hover:bg-violet-950/20 cursor-pointer'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-70">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 12V4m0 0L9 7m3-3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{dragging ? 'Drop to transcribe' : 'Upload audio file'}</span>
                <span className="text-[10px] opacity-60">mp3 · wav · m4a · flac · webm</span>
              </button>
            </>
          )}
        </div>

        {/* Model status */}
        <div className="px-4 py-3 border-t border-stone-800">
          <div className="flex items-center gap-2 text-xs text-stone-600">
            <div className={`w-1.5 h-1.5 rounded-full ${modelLoaded === null ? 'bg-stone-700' : modelLoaded ? 'bg-green-500' : 'bg-amber-400'}`} />
            {modelLoaded === null && 'Checking model…'}
            {modelLoaded === false && 'Model will load on first use'}
            {modelLoaded === true && `Whisper ${modelName} loaded`}
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handlePanelResizeStart}
        title="Drag to resize"
        className="relative flex-shrink-0 w-2 cursor-col-resize group select-none z-10"
      >
        <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ${
          isPanelResizing ? 'bg-violet-500' : 'bg-stone-800 group-hover:bg-violet-500/50'
        }`} />
      </div>

      {/* ── Right: output ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-stone-950">

        {/* Latest transcription */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-950/50 border border-red-900/60 rounded text-sm text-red-400 leading-relaxed">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-red-600 hover:text-red-400"
              >×</button>
            </div>
          )}

          {/* Transcript header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium tracking-wider uppercase text-stone-500">Transcript</span>
            {latest && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyLatest}
                  className="text-xs px-2 py-1 rounded bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-600 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setTranscripts([])}
                  className="text-xs px-2 py-1 rounded bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Latest result */}
          {!latest && !transcribing && (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(139,92,246,0.05) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            >
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="mb-4 opacity-10 text-violet-400">
                <rect x="8" y="1" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 17v3M9.5 20h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-stone-600 text-sm font-medium">No transcription yet</p>
              <p className="text-stone-700 text-xs mt-1">Record with the mic or upload an audio file</p>
            </div>
          )}

          {transcribing && !latest && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="inline-block w-8 h-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-4" />
              <p className="text-violet-400 text-sm font-medium">Transcribing…</p>
              <p className="text-stone-600 text-xs mt-1">Whisper {modelName} is processing your audio</p>
            </div>
          )}

          {latest && (
            <div className="relative mb-6">
              {transcribing && (
                <div className="absolute inset-0 bg-stone-950/70 flex items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-violet-400 text-sm">
                    <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                    Transcribing new recording…
                  </div>
                </div>
              )}
              <div className="px-5 py-4 bg-stone-900 border border-stone-800 rounded-lg">
                <p className="text-stone-100 text-lg leading-relaxed font-light">{latest.text}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-stone-600">
                  <span className="font-mono">{latest.language.toUpperCase()}</span>
                  <span>·</span>
                  <span>{fmtDuration(latest.duration)} audio</span>
                  <span>·</span>
                  <span>{latest.text.split(/\s+/).length} words</span>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {transcripts.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium tracking-wider uppercase text-stone-600">History</span>
                <div className="flex-1 h-px bg-stone-800" />
              </div>
              <div className="space-y-2">
                {transcripts.slice(1).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTranscripts((prev) => [t, ...prev.filter((x) => x.id !== t.id)])}
                    className="w-full text-left px-4 py-3 rounded-lg bg-stone-900/60 border border-stone-800/60 hover:border-stone-700 hover:bg-stone-900 transition-colors group"
                  >
                    <p className="text-stone-400 text-sm leading-snug group-hover:text-stone-300 truncate">
                      {t.text}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-600">
                      <span className="font-mono">{t.language.toUpperCase()}</span>
                      <span>·</span>
                      <span>{fmtDuration(t.duration)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
