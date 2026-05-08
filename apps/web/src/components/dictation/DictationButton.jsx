import { useDictation } from '@/hooks/useDictation'

/**
 * Reusable mic-record-and-transcribe button. Thin wrapper around the
 * useDictation hook (which owns all MediaRecorder + STT lifecycle).
 *
 *   <DictationButton onTranscribe={(text) => setNoteText(prev => prev + text)} />
 *
 * Click to start recording (browser asks for mic permission once); click
 * again to stop and transcribe via the Windows STT API. The transcribed
 * text is appended via `onTranscribe`. Errors surface as `onError`
 * callbacks; if not supplied, errors fall through to console.
 *
 * For non-button surfaces (e.g. Phase G global hotkey in ChapterView)
 * use the useDictation hook directly.
 */
export function DictationButton({ onTranscribe, onError, language = 'auto', className = '', title = 'Dictate (mic)' }) {
  const { start, stop, state, elapsed } = useDictation({ onTranscribe, onError, language })
  const handleClick = state === 'recording' ? stop : start

  if (state === 'transcribing') {
    return (
      <button
        type="button"
        className={className}
        disabled
        title="Transcribing…"
        style={{ cursor: 'wait' }}
      >
        <span className="dictation-spinner" aria-label="Transcribing">⟳</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      title={state === 'recording' ? `Recording ${elapsed}s — click to stop` : title}
      aria-pressed={state === 'recording'}
      style={{
        background: state === 'recording' ? 'rgba(240, 82, 82, 0.18)' : 'transparent',
        border: '1px solid var(--sidebar-border)',
        color: state === 'recording' ? '#f05252' : 'var(--text-dim)',
        borderRadius: 'var(--radius)',
        padding: '4px 8px',
        fontSize: 12,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span aria-hidden="true">{state === 'recording' ? '●' : '🎙'}</span>
      <span>{state === 'recording' ? `${elapsed}s` : 'Dictate'}</span>
    </button>
  )
}
