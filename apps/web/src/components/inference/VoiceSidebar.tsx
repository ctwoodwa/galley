import { useState, type CSSProperties } from 'react'
import { VoiceRow } from './VoiceRow'
import { VoiceMetadata } from './VoiceMetadata'
import { UploadModal } from './UploadModal'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import type { TTSClient, VoiceInfo, VoiceMetadata as VMeta } from '@galley/api-client'
import { prettifyVoiceId } from '@/lib/inference/voiceNames'

const LANGUAGE_ORDER = [
  'American English',
  'British English',
  'French',
  'Spanish',
  'Italian',
  'Brazilian Portuguese',
  'Hindi',
  'Japanese',
  'Mandarin Chinese',
  'Unknown',
]

interface VoiceSidebarProps {
  client: TTSClient
  voices: VoiceInfo[]
  loading: boolean
  onRefresh: () => void
  selectedVoice: string
  onSelect: (id: string) => void
  readonly?: boolean
  getPrefetchedMeta?: (id: string) => VMeta
  favorites?: Set<string>
  onFavoriteToggle?: (id: string) => void
  style?: CSSProperties
}

export function VoiceSidebar({
  client, voices, loading, onRefresh, selectedVoice, onSelect,
  readonly = false, getPrefetchedMeta,
  favorites, onFavoriteToggle, style,
}: VoiceSidebarProps) {
  const [showUpload, setShowUpload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (voiceId: string) => {
    setDeleteError(null)
    try {
      await client.deleteVoice(voiceId)
      if (selectedVoice === voiceId) onSelect('en_woman')
      onRefresh()
    } catch (e) {
      setDeleteError(String(e))
    } finally {
      setDeleteTarget(null)
    }
  }

  const favSet = favorites ?? new Set<string>()
  const favVoices = voices.filter((v) => favSet.has(v.id))
  const otherVoices = voices.filter((v) => !favSet.has(v.id))

  const renderRow = (v: VoiceInfo, inGroup = false) => {
    let displayName: string
    let subtitle: string | undefined

    if (getPrefetchedMeta) {
      const meta = getPrefetchedMeta(v.id)
      displayName = meta.display_name ?? prettifyVoiceId(v.id)
      const genderKey = v.id[1]?.toLowerCase()
      subtitle = inGroup
        ? (genderKey === 'f' ? 'Female' : genderKey === 'm' ? 'Male' : undefined)
        : meta.notes
    } else {
      displayName = prettifyVoiceId(v.id)
      subtitle = !v.is_stock ? 'custom' : undefined
    }

    return (
      <VoiceRow
        key={v.id}
        voice={v}
        selected={v.id === selectedVoice}
        onSelect={() => onSelect(v.id)}
        onDelete={readonly ? undefined : () => setDeleteTarget(v.id)}
        isFavorite={favSet.has(v.id)}
        onFavoriteToggle={onFavoriteToggle ? () => onFavoriteToggle(v.id) : undefined}
        displayName={displayName}
        subtitle={subtitle}
      />
    )
  }

  // Group by language when we have prefetched metadata (Kokoro mode)
  const groups: { label: string; voices: VoiceInfo[] }[] | null = getPrefetchedMeta
    ? (() => {
        const map = new Map<string, VoiceInfo[]>()
        for (const v of otherVoices) {
          const lang = getPrefetchedMeta(v.id).language ?? 'Unknown'
          if (!map.has(lang)) map.set(lang, [])
          map.get(lang)!.push(v)
        }
        return LANGUAGE_ORDER
          .filter((lang) => map.has(lang))
          .map((lang) => ({ label: lang, voices: map.get(lang)! }))
      })()
    : null

  return (
    <aside className="flex-shrink-0 flex flex-col bg-stone-900 overflow-hidden" style={style}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800">
        <span className="text-sm font-medium text-stone-300">
          Voices
          {loading
            ? <span className="text-stone-600 ml-1 text-xs">…</span>
            : <span className="text-stone-600 ml-1 text-xs">({voices.length})</span>
          }
        </span>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            title="Refresh voice list"
            aria-label="Refresh voice list"
            className="text-stone-500 hover:text-stone-300 text-sm px-1 transition-colors"
          >
            ↺
          </button>
          {!readonly && (
            <button
              onClick={() => setShowUpload(true)}
              className="text-xs px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-stone-100 transition-colors font-medium"
            >
              Upload
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div role="alert" className="px-3 py-2 text-xs text-red-400 bg-red-950/50 border-b border-red-900">{deleteError}</div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {favVoices.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 text-xs font-medium tracking-wider uppercase text-stone-600">
              ★ Favorites
            </div>
            {favVoices.map((v) => renderRow(v, false))}
            <div className="mx-3 my-1 border-t border-stone-800" />
          </>
        )}

        {groups
          ? groups.map(({ label, voices: gVoices }) => (
              <div key={label}>
                <div className="px-3 pt-2 pb-1 text-xs font-medium tracking-wider uppercase text-stone-600">
                  {label}
                </div>
                {gVoices.map((v) => renderRow(v, true))}
              </div>
            ))
          : otherVoices.map((v) => renderRow(v))
        }
      </div>

      {selectedVoice && (
        <div className="border-t border-stone-800 overflow-y-auto max-h-64">
          <VoiceMetadata
            voiceId={selectedVoice}
            client={client}
            prefetched={getPrefetchedMeta?.(selectedVoice)}
          />
        </div>
      )}

      {showUpload && (
        <UploadModal client={client} onSuccess={onRefresh} onClose={() => setShowUpload(false)} />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          voiceId={deleteTarget}
          onConfirm={() => void handleDelete(deleteTarget)}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null) }}
        />
      )}
    </aside>
  )
}
