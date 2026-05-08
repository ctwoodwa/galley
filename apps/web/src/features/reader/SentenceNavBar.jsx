import { useEffect, useState } from 'react'

/**
 * Sentence-aware navigation row that sits inside .sticky-player-bar (under
 * the AudioPlayer). Driven by alignment chunks: prev-sentence / next-sentence,
 * prev-paragraph / next-paragraph, and a position indicator.
 *
 * Position counter walks the chunkMap (chunk → DOM element) so paragraph
 * counts reflect actual page paragraphs, not is_pause-separated runs (which
 * are sentence-bounded — every sentence is followed by a pause chunk in
 * audiobook.py output, so they're useless as paragraph delimiters).
 *
 * Stays out of the way when no alignment data is loaded (renders nothing) so
 * un-rendered chapters or chapters without alignment behave as before.
 */
export default function SentenceNavBar({
  alignedChunks,
  chunkMapRef,
  playerRef,
  onPrevSentence,
  onNextSentence,
  onPrevParagraph,
  onNextParagraph,
}) {
  const [pos, setPos] = useState({
    sentIndex: 0,
    sentTotal: 0,
    paraIndex: 0,
    paraTotal: 0,
    sentInPara: 0,
    sentInParaTotal: 0,
  })

  useEffect(() => {
    if (!alignedChunks?.length) return undefined

    const sentTotal = alignedChunks.filter((c) => !c.is_pause).length

    const tick = () => {
      const audio = playerRef.current?.audio?.()
      if (!audio) return
      const t = audio.currentTime

      const map = chunkMapRef?.current ?? []

      // Find current chunk index in the FLAT alignedChunks list (so sentIndex
      // is monotonic and matches the keyboard shuttle's stepping).
      let curFlatIdx = -1
      for (let i = 0; i < alignedChunks.length; i++) {
        if (t >= alignedChunks[i].start_seconds && t < alignedChunks[i].end_seconds) {
          curFlatIdx = i
          break
        }
      }
      if (curFlatIdx < 0) curFlatIdx = 0

      // Sentence index = count of non-pause chunks at-or-before curFlatIdx.
      let sentIndex = 0
      for (let i = 0; i <= curFlatIdx; i++) {
        if (!alignedChunks[i].is_pause) sentIndex += 1
      }

      // Paragraph counts come from the chunkMap (which has .element for each
      // chunk). Count distinct .element transitions up to current chunk.
      let paraIndex = 0
      let paraTotal = 0
      let sentInPara = 0
      let sentInParaTotal = 0
      if (map.length) {
        let lastEl = null
        let curEl = null
        for (let i = 0; i < map.length; i++) {
          const entry = map[i]
          if (!entry.element) continue
          if (entry.element !== lastEl) {
            paraTotal += 1
            lastEl = entry.element
          }
          if (i <= curFlatIdx) {
            if (entry.element !== curEl) paraIndex = paraTotal
            curEl = entry.element
          }
        }

        if (curEl) {
          for (const entry of map) {
            if (entry.element === curEl && !entry.is_pause) sentInParaTotal += 1
          }
          for (let i = 0; i <= curFlatIdx; i++) {
            const entry = map[i]
            if (entry.element === curEl && !entry.is_pause) sentInPara += 1
          }
        }
      }

      setPos({
        sentIndex,
        sentTotal,
        paraIndex,
        paraTotal,
        sentInPara,
        sentInParaTotal,
      })
    }

    const id = setInterval(tick, 250)
    tick()
    return () => clearInterval(id)
  }, [alignedChunks, chunkMapRef, playerRef])

  if (!alignedChunks?.length) return null

  return (
    <div className="sentence-nav-row">
      <button
        className="sentence-nav-btn"
        onClick={onPrevParagraph}
        title="Previous paragraph (Shift+←)"
        aria-label="Previous paragraph"
      >
        ◀◀
      </button>
      <button
        className="sentence-nav-btn"
        onClick={onPrevSentence}
        title="Previous sentence (←)"
        aria-label="Previous sentence"
      >
        ◀
      </button>
      <div className="sentence-nav-pos">
        sent <strong>{pos.sentIndex}</strong>/{pos.sentTotal}
        {pos.paraTotal > 0 && (
          <>
            <span className="sep">·</span>¶ <strong>{pos.paraIndex}</strong>/{pos.paraTotal}
            {pos.sentInParaTotal > 0 && (
              <>
                <span className="sep">·</span>{pos.sentInPara}/{pos.sentInParaTotal} in ¶
              </>
            )}
          </>
        )}
      </div>
      <button
        className="sentence-nav-btn"
        onClick={onNextSentence}
        title="Next sentence (→)"
        aria-label="Next sentence"
      >
        ▶
      </button>
      <button
        className="sentence-nav-btn"
        onClick={onNextParagraph}
        title="Next paragraph (Shift+→)"
        aria-label="Next paragraph"
      >
        ▶▶
      </button>
    </div>
  )
}
