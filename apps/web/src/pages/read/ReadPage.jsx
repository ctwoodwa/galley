import { useOutletContext } from 'react-router-dom'
import ChapterView from '../../features/reader/ChapterView.jsx'
import {
  EditorialChatPanel,
  useChatKeybind,
} from '../../features/chat'

export default function ReadPage() {
  const {
    bookId, chapters, selected, volume, loading,
    queue,
    reviewSession, savedChapterState,
    onAudioGenerated, onAddToQueue, onCommentAdded,
    onReaderStateChange,
  } = useOutletContext()

  // ⌘K / Ctrl+K toggles the chat panel; Escape closes it when focused.
  useChatKeybind()

  const chatPanel = selected ? (
    <EditorialChatPanel
      bookId={bookId}
      chapterId={selected.id}
      chapterTitle={selected.title}
    />
  ) : null

  if (selected) {
    return (
      <>
        <ChapterView
          bookId={bookId}
          chapter={selected}
          queue={queue}
          onAudioGenerated={onAudioGenerated}
          onAddToQueue={onAddToQueue}
          onCommentAdded={onCommentAdded}
          savedState={savedChapterState}
          onReaderStateChange={onReaderStateChange}
          reviewComments={reviewSession.comments}
        />
        {chatPanel}
      </>
    )
  }

  return (
    <>
      <div className="welcome">
        <div className="welcome-inner">
          <div className="welcome-icon">📖</div>
          <h2>Select a chapter to begin</h2>
          <p>
            {volume === 'vol-1'
              ? 'Volume 1 — The Inverted Stack: Local-First Nodes in a SaaS World'
              : 'Volume 2 — Sunfish-1 Mission Narrative'}
          </p>
          {!loading && (
            <p className="welcome-stats">
              {chapters.filter(c => c.volume === volume).length} chapters •{' '}
              {chapters.filter(c => c.volume === volume && c.has_audio).length} with audio
            </p>
          )}
        </div>
      </div>
    </>
  )
}
