import { useEffect, useState } from 'react'

/**
 * Sentence-aware navigation row that sits inside .sticky-player-bar (under
 * the AudioPlayer). Driven by alignment chunks: prev-sentence / next-sentence,
 * prev-paragraph / next-paragraph, and a position indicator showing
 * "¶ N · sentence M / total".
 *
 * Stays out of the way when no alignment data is loaded (renders nothing) so
 * un-rendered chapters or chapters without alignment behave as before.
 */
export default function SentenceNavBar({
  alignedChunks,
  playerRef,
  onPrevSentence,
  onNextSentence,
  onPrevParagraph,
  onNextParagraph,
}) {
  const [pos, setPos] = useState({ paraIdx: 0, sentInPara: 0, sentInParaTotal: 0, total: 0 })

  useEffect(() => {
    if (!alignedChunks?.length) return undefined

    const tick = () => {
      const audio = playerRef.current?.audio?.()
      if (!audio) return
      const t = audio.currentTime
      // Find current chunk
      let curIdx = -1
      for (let i = 0; i < alignedChunks.length; i++) {
        if (t >= alignedChunks[i].start_seconds && t < alignedChunks[i].end_seconds) {
          curIdx = i
          break
        }
      }
      if (curIdx < 0) curIdx = 0

      // Walk forward + back to count paragraph transitions and per-paragraph sentence index.
      // Treat each unique element-text-prefix as a paragraph boundary.
      const cur = alignedChunks[curIdx]
      // Paragraph index = number of distinct (non-pause) elements seen up to here.
      // Use chunk_index since alignment doesn't store element directly here.
      // Approximation: paragraphs = distinct preceding chunk runs separated by is_pause.
      let paraIdx = 0
      let sentInPara = 0
      let sentInParaTotal = 0
      let inSent = false
      let runStart = 0
      for (let i = 0; i <= curIdx; i++) {
        const c = alignedChunks[i]
        if (c.is_pause) {
          if (inSent) {
            paraIdx += 1
            inSent = false
          }
          continue
        }
        if (!inSent) {
          inSent = true
          runStart = i
          sentInPara = 0
        }
        if (i === curIdx) sentInPara = i - runStart
      }
      // Count sentences in current paragraph total
      if (inSent) {
        let i = runStart
        while (i < alignedChunks.length && !alignedChunks[i].is_pause) {
          sentInParaTotal += 1
          i += 1
        }
      }

      setPos({
        paraIdx: paraIdx + 1,
        sentInPara: sentInPara + 1,
        sentInParaTotal,
        total: alignedChunks.filter((c) => !c.is_pause).length,
      })
    }

    const id = setInterval(tick, 250)
    tick()
    return () => clearInterval(id)
  }, [alignedChunks, playerRef])

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
        ¶ <strong>{pos.paraIdx}</strong>
        {pos.sentInParaTotal > 0 && (
          <>
            <span className="sep">·</span>sent <strong>{pos.sentInPara}</strong>/{pos.sentInParaTotal}
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
