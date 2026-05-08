const ENGINE_LABEL = {
  kokoro:     { label: 'Kokoro',     quality: 'Draft',   cls: 'engine-kokoro' },
  chatterbox: { label: 'Chatterbox', quality: 'Quality', cls: 'engine-chatterbox' },
}

export default function AudioMeta({ info, planned }) {
  if (planned) {
    return (
      <div className="audio-meta planned">
        <span className="meta-tag planned-tag">Planned</span>
        <span className="meta-tag voice-tag">{planned}</span>
        <span className="meta-tag engine-tag engine-chatterbox">Chatterbox</span>
      </div>
    )
  }

  if (!info) return null

  const eng = ENGINE_LABEL[info.engine] ?? { label: info.engine, quality: '', cls: '' }
  const voiceName = info.voice || info.preset || '—'

  return (
    <div className="audio-meta rendered">
      <span className={`meta-tag engine-tag ${eng.cls}`} title={`Engine: ${info.engine}`}>
        {eng.quality ? `${eng.label} · ${eng.quality}` : eng.label}
      </span>
      <span className="meta-tag voice-tag" title="Voice / preset">
        {voiceName}
      </span>
      {info.per_sentence && (
        <span className="meta-tag mode-tag" title="Generated sentence by sentence">per-sentence</span>
      )}
      {info.speed != null && info.speed !== 1.0 && (
        <span className="meta-tag speed-tag" title="Playback speed used during generation">{info.speed}×</span>
      )}
    </div>
  )
}
