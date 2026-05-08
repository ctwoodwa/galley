import { useState, useEffect } from 'react'
import type { TTSClient, VoiceMetadata as VMeta } from '@galley/api-client'

interface VoiceMetadataProps {
  voiceId: string
  client: TTSClient
  prefetched?: VMeta
}

function Field({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-stone-600 flex-shrink-0 w-20">{label}</span>
      <span className="text-stone-300">{String(value)}</span>
    </div>
  )
}

export function VoiceMetadata({ voiceId, client, prefetched }: VoiceMetadataProps) {
  const [meta, setMeta] = useState<VMeta | null>(prefetched ?? null)

  useEffect(() => {
    if (prefetched !== undefined) { setMeta(prefetched); return }
    let cancelled = false
    setMeta(null)
    client.getVoice(voiceId)
      .then((m) => { if (!cancelled) setMeta(m) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [voiceId, client, prefetched])

  if (!meta) {
    return (
      <div className="p-4 text-sm text-stone-600 flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-stone-600 border-t-amber-400 animate-spin" />
        Loading…
      </div>
    )
  }

  const uploadedAt = meta.uploaded_at ? new Date(meta.uploaded_at).toLocaleString() : undefined

  return (
    <div className="p-4 flex flex-col gap-2.5">
      <div>
        <div className="font-semibold text-stone-100 text-sm">{meta.display_name ?? meta.id}</div>
        {meta.display_name && (
          <div className="font-mono text-xs text-stone-600 mt-0.5">{meta.id}</div>
        )}
      </div>
      {meta.transcript && (
        <blockquote className="text-sm italic text-stone-400 border-l-2 border-stone-700 pl-3 leading-relaxed">
          {meta.transcript}
        </blockquote>
      )}
      <div className="flex flex-col gap-1.5">
        <Field label="Language" value={meta.language} />
        <Field label="Notes" value={meta.notes} />
        <Field label="Duration" value={meta.duration_seconds !== undefined ? `${meta.duration_seconds.toFixed(1)} s` : undefined} />
        <Field label="Sample rate" value={meta.sample_rate ? `${meta.sample_rate} Hz` : undefined} />
        <Field label="Uploaded" value={uploadedAt} />
      </div>
    </div>
  )
}
