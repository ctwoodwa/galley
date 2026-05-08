import { useMemo } from 'react'
import type { Track } from '@galley/api-client'
import { useMusicClient } from '@/api/clients'
import AudioPlayerBar from '@/components/audio-player/AudioPlayerBar'
import { Waveform } from './Waveform'
import { IconSkip, IconBack, IconStar, IconStarOut, IconQueue } from './icons'

interface Props {
  track: Track | null
  queueLen: number
  showQueue: boolean
  onPrev: () => void
  onNext: () => void
  onFav: (id: string) => void
  onToggleQueue: () => void
}

/**
 * Music-tab footer playback bar. Uses the shared AudioPlayerBar so the
 * play / seek / time / volume / download UX is identical to the editorial
 * chapter player and the TTS preview. Music-specific bits (artwork +
 * meta on the left, prev/next/queue on the right) are layered on top of
 * the shared bar so the music UX stays distinctive without diverging
 * the playback contract.
 *
 * The previous version drove playback through a hidden <audio ref> in
 * MusicPanel; that's gone. AudioPlayerBar owns the <audio> element + all
 * playback state, advances the queue via onEnded, and exposes a stable
 * UI matching the rest of the app.
 */
export function MusicPlayer({
  track, queueLen, showQueue, onPrev, onNext, onFav, onToggleQueue,
}: Props) {
  const client = useMusicClient()
  const src = useMemo(() => {
    if (!track?.file_path) return undefined
    return client.trackStreamUrl(track.file_path)
  }, [track?.file_path, client])

  const artBg = track
    ? `linear-gradient(135deg, ${track.color}, color-mix(in oklab, ${track.color} 30%, #000))`
    : 'var(--mp-bg-3)'

  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--mp-bg-1)',
      borderTop: '1px solid var(--mp-line)',
      display: 'grid',
      gridTemplateColumns: '280px 1fr 200px',
      gap: 24, padding: '12px 24px',
      alignItems: 'center',
    }}>
      {/* left — track info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
        <div style={{ width: 44, height: 44, borderRadius: 4, background: artBg, flexShrink: 0, overflow: 'hidden' }}>
          {track && <Waveform seed={track.id} bars={30} height={44} active={0} />}
        </div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 500, color: track ? 'var(--mp-fg)' : 'var(--mp-fg-4)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track?.title ?? 'No track selected'}
          </div>
          {track && (
            <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.artist || track.source}
            </div>
          )}
        </div>
        {track && (
          <button
            onClick={() => onFav(track.id)}
            style={{
              color: track.favorite ? 'var(--mp-accent)' : 'var(--mp-fg-4)',
              flexShrink: 0,
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            title={track.favorite ? 'Remove favorite' : 'Add favorite'}
          >
            {track.favorite ? <IconStar width={14} height={14} /> : <IconStarOut width={14} height={14} />}
          </button>
        )}
      </div>

      {/* center — prev/next + shared AudioPlayerBar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onPrev}
          disabled={!track}
          style={{ color: 'var(--mp-fg-3)', background: 'transparent', border: 'none', cursor: track ? 'pointer' : 'default' }}
          title="Previous"
        >
          <IconBack width={18} height={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {src ? (
            <AudioPlayerBar
              key={src}
              src={src}
              downloadName={track ? `${track.title || track.id}.mp3` : 'track.mp3'}
              autoPlay
              onEnded={onNext}
            />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--mp-fg-4)', textAlign: 'center', padding: '8px 0' }}>
              Select a track to play
            </div>
          )}
        </div>
        <button
          onClick={onNext}
          disabled={!track}
          style={{ color: 'var(--mp-fg-3)', background: 'transparent', border: 'none', cursor: track ? 'pointer' : 'default' }}
          title="Next"
        >
          <IconSkip width={18} height={18} />
        </button>
      </div>

      {/* right — queue toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={onToggleQueue}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
            color: showQueue ? 'var(--mp-accent)' : 'var(--mp-fg-3)',
            padding: '4px 8px',
            border: `1px solid ${showQueue ? 'var(--mp-accent)' : 'transparent'}`,
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <IconQueue width={14} height={14} />
          {queueLen > 0 && (
            <span style={{
              background: 'var(--mp-accent)', color: '#1a1610',
              borderRadius: 99, padding: '1px 5px', fontSize: 10,
            }}>
              {queueLen}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
