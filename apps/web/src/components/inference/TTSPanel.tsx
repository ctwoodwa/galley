import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoices } from '@/hooks/inference/useVoices'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import { useFavorites } from '@/hooks/inference/useFavorites'
import { VoiceSidebar } from './VoiceSidebar'
import { SynthesisPanel } from './SynthesisPanel'
import { PRESETS } from './PresetButtons'
import { kokoroVoiceMeta } from '@/lib/inference/kokoroMeta'
import type { TTSClient, KnobValues, AudioFormat, ModelId } from '@galley/api-client'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 540
const SIDEBAR_DEFAULT = 288

function getStoredSidebarWidth(): number {
  try {
    const v = localStorage.getItem('tts_sidebar_width')
    if (v) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(v, 10)))
  } catch {}
  return SIDEBAR_DEFAULT
}

interface TTSPanelProps {
  client: TTSClient
  serverReachable: boolean
}

export function TTSPanel({ client, serverReachable }: TTSPanelProps) {
  const { voices, loading: voicesLoading, error: voicesError, refresh: refreshVoices } = useVoices(client)
  const { voices: kokoroVoices, loading: kokoroLoading, error: kokoroError, refresh: refreshKokoroVoices } = useVoices(client, 'kokoro')

  const [model, setModel] = useLocalStorage<ModelId>('is.tts.model', 'higgs')
  const [selectedVoice, setSelectedVoice] = useLocalStorage('is.tts.voice.higgs', 'en_woman')
  const [kokoroVoice, setKokoroVoice] = useLocalStorage('is.tts.voice.kokoro', 'af_heart')
  const [knobs, setKnobs] = useLocalStorage<KnobValues>('is.tts.knobs', PRESETS['Neutral'])
  const [format, setFormat] = useLocalStorage<AudioFormat>('is.tts.format', 'mp3')

  const { favorites: higgsFavs, toggle: toggleHiggsFav } = useFavorites('tts_favorites_higgs')
  const { favorites: kokoroFavs, toggle: toggleKokoroFav } = useFavorites('tts_favorites_kokoro')

  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth)
  const [isDragging, setIsDragging] = useState(false)
  const isResizingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)
  const currentWidthRef = useRef(sidebarWidth)

  useEffect(() => { currentWidthRef.current = sidebarWidth }, [sidebarWidth])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = currentWidthRef.current
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const next = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, dragStartWidthRef.current + e.clientX - dragStartXRef.current),
      )
      currentWidthRef.current = next
      setSidebarWidth(next)
    }
    const onMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem('tts_sidebar_width', String(currentWidthRef.current)) } catch {}
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleResizeDoubleClick = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT)
    currentWidthRef.current = SIDEBAR_DEFAULT
    try { localStorage.setItem('tts_sidebar_width', String(SIDEBAR_DEFAULT)) } catch {}
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      {model === 'higgs' ? (
        <VoiceSidebar
          client={client}
          voices={voices}
          loading={voicesLoading}
          error={voicesError}
          onRefresh={refreshVoices}
          selectedVoice={selectedVoice}
          onSelect={setSelectedVoice}
          favorites={higgsFavs}
          onFavoriteToggle={toggleHiggsFav}
          style={{ width: sidebarWidth }}
        />
      ) : (
        <VoiceSidebar
          client={client}
          voices={kokoroVoices}
          loading={kokoroLoading}
          error={kokoroError}
          onRefresh={refreshKokoroVoices}
          selectedVoice={kokoroVoice}
          onSelect={setKokoroVoice}
          readonly
          getPrefetchedMeta={kokoroVoiceMeta}
          favorites={kokoroFavs}
          onFavoriteToggle={toggleKokoroFav}
          style={{ width: sidebarWidth }}
        />
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeDoubleClick}
        title="Drag to resize · Double-click to reset"
        className="relative flex-shrink-0 w-2 cursor-col-resize group select-none z-10"
      >
        <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ${
          isDragging ? 'bg-amber-500' : 'bg-stone-800 group-hover:bg-amber-500/50'
        }`} />
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] transition-opacity duration-150 ${
          isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`w-[3px] h-[3px] rounded-full transition-colors ${
              isDragging ? 'bg-amber-400' : 'bg-amber-500/70'
            }`} />
          ))}
        </div>
        {isDragging && (
          <div className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 bg-amber-500/5" />
        )}
      </div>

      <SynthesisPanel
        client={client}
        selectedVoice={selectedVoice}
        model={model}
        onModelChange={setModel}
        kokoroVoice={kokoroVoice}
        knobs={knobs}
        onKnobsChange={setKnobs}
        format={format}
        onFormatChange={setFormat}
        serverReachable={serverReachable}
      />
    </div>
  )
}
