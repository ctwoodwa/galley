import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'

const AudioPlayer = forwardRef(function AudioPlayer({ bookId, chapter, tracks, onTimeUpdate, initialTime = 0 }, ref) {
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0)
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [loading, setLoading] = useState(true)
  const seekApplied = useRef(false)

  const hasTracks = tracks && tracks.length > 0
  const currentTrack = hasTracks ? tracks[Math.min(selectedTrackIdx, tracks.length - 1)] : null
  const src = currentTrack
    ? currentTrack.url
    : `/api/books/${bookId}/audio/${chapter.volume}/${chapter.slug}.mp3`

  useImperativeHandle(ref, () => ({
    togglePlay() {
      const audio = audioRef.current
      if (!audio || loading) return
      if (playing) audio.pause()
      else audio.play().catch(() => {})
    },
    seek(delta) {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta))
    },
    changeVolume(delta) {
      const audio = audioRef.current
      if (!audio) return
      const next = Math.max(0, Math.min(1, audio.volume + delta))
      audio.volume = next
      setVolume(next)
    },
    audio: () => audioRef.current,
  }), [playing, loading])

  useEffect(() => {
    seekApplied.current = false
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setLoading(true)
    setSelectedTrackIdx(0)
  }, [chapter.id])

  useEffect(() => {
    seekApplied.current = false
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setLoading(true)
    if (audioRef.current) audioRef.current.load()
  }, [selectedTrackIdx])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play().catch(() => {})
  }

  const seek = e => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * duration
  }

  const fmt = s => {
    if (!s || isNaN(s)) return '0:00'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  const engineDotClass = (eng) => {
    if (eng === 'chatterbox') return 'dot-chatterbox'
    if (eng === 'kokoro') return 'dot-kokoro'
    return 'dot-unknown'
  }

  const truncateKey = (key, max = 16) =>
    key && key.length > max ? key.slice(0, max) + '…' : key

  return (
    <div className="audio-player">
      {hasTracks && tracks.length > 1 && (
        <div className="track-selector">
          {tracks.map((track, idx) => (
            <button
              key={track.key}
              className={`track-btn ${idx === selectedTrackIdx ? 'active' : ''}`}
              onClick={() => setSelectedTrackIdx(idx)}
              title={`${track.key}${track.engine ? ` · ${track.engine}` : ''}${track.voice ? ` · ${track.voice}` : ''}`}
            >
              <span className={`track-dot ${engineDotClass(track.engine)}`} />
              {truncateKey(track.key)}
            </button>
          ))}
        </div>
      )}

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime || 0
          setCurrentTime(t)
          if (onTimeUpdate) onTimeUpdate(t)
        }}
        onDurationChange={() => { setDuration(audioRef.current?.duration || 0); setLoading(false) }}
        onLoadedMetadata={() => {
          const dur = audioRef.current?.duration || 0
          setDuration(dur)
          setLoading(false)
          if (!seekApplied.current && initialTime > 0 && audioRef.current && dur > initialTime) {
            audioRef.current.currentTime = initialTime
            seekApplied.current = true
          }
        }}
        onCanPlay={() => setLoading(false)}
      />

      <div className="player-controls">
        <button className="play-btn" onClick={togglePlay} disabled={loading}>
          {loading ? (
            <span className="spinner" />
          ) : playing ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <div className="player-time">{fmt(currentTime)}</div>

        <div className="progress-track" onClick={seek}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <div className="progress-thumb" style={{ left: `${progress}%` }} />
        </div>

        <div className="player-time">{fmt(duration)}</div>

        <div className="volume-control">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ opacity: 0.6 }}>
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
          <input
            type="range" min="0" max="1" step="0.05" value={volume}
            className="volume-slider"
            onChange={e => {
              const v = parseFloat(e.target.value)
              setVolume(v)
              if (audioRef.current) audioRef.current.volume = v
            }}
          />
        </div>

        <a
          href={src}
          download={currentTrack ? currentTrack.key + '.mp3' : `${chapter.slug}.mp3`}
          className="download-btn"
          title="Download MP3"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </a>
      </div>
    </div>
  )
})

export default AudioPlayer
