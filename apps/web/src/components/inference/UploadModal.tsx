import { useState, useRef, useEffect } from 'react'
import type { TTSClient } from '@galley/api-client'

interface UploadModalProps {
  client: TTSClient
  onSuccess: () => void
  onClose: () => void
}

export function UploadModal({ client, onSuccess, onClose }: UploadModalProps) {
  const [voiceId, setVoiceId] = useState('')
  const [transcript, setTranscript] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [language, setLanguage] = useState('en-US')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const idValid = /^[a-z0-9_-]{1,64}$/.test(voiceId)

  const handleSubmit = async () => {
    setError(null)
    if (!idValid) { setError('Voice ID must match ^[a-z0-9_-]{1,64}$'); return }
    if (transcript.length < 8) { setError('Transcript must be at least 8 characters'); return }
    if (!fileRef.current?.files?.[0]) { setError('Select an audio file'); return }
    const fd = new FormData()
    fd.append('audio', fileRef.current.files[0])
    fd.append('transcript', transcript)
    if (displayName) fd.append('display_name', displayName)
    fd.append('language', language)
    if (notes) fd.append('notes', notes)
    setLoading(true)
    try {
      const { status } = await client.uploadVoice(voiceId, fd)
      if (status === 409) { setError('That ID belongs to a stock voice — choose a different ID'); return }
      if (status !== 200 && status !== 201) { setError(`Upload failed: ${status}`); return }
      onSuccess()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const fieldCls = "px-2.5 py-1.5 text-sm bg-stone-800 border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-amber-500 transition-colors"
  const labelCls = "text-sm text-stone-400"
  const hintCls = "text-stone-600"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        className="bg-stone-900 border border-stone-700 rounded-xl p-6 w-96 flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <h2 id="upload-dialog-title" className="text-stone-100 font-semibold">Upload voice</h2>

        {error && (
          <p role="alert" className="text-sm text-red-300 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Voice ID <span className={hintCls}>(a-z, 0-9, _, -)</span></span>
          <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}
            className={`${fieldCls} font-mono`} placeholder="my-voice" />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Audio file <span className={hintCls}>(WAV/MP3/FLAC, 3–60 s, ≤ 10 MB)</span></span>
          <input type="file" ref={fileRef} accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac"
            className="text-sm text-stone-300 file:mr-3 file:px-3 file:py-1 file:rounded file:bg-stone-700 file:text-stone-300 file:border-0 file:hover:bg-stone-600 file:transition-colors" />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Transcript <span className={hintCls}>(exact text spoken)</span></span>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3}
            className={`${fieldCls} resize-none`} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Display name <span className={hintCls}>(optional)</span></span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Language (BCP-47)</span>
          <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)}
            className={fieldCls} placeholder="en-US" />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Notes / provenance <span className={hintCls}>(optional)</span></span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className={`${fieldCls} resize-none`} placeholder="LibriVox: Title ch.1, narrator J. Smith, CC0" />
        </label>

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => void handleSubmit()} disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium disabled:opacity-50 transition-colors">
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
