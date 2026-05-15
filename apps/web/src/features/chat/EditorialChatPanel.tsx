import { useEffect, useRef, useState } from 'react'
import { X, Send, Loader2, AlertTriangle, Trash2 } from 'lucide-react'

import { useApiConfig } from '@/api/config'
import { useChatPrefs } from '@/api/chatPrefs'
import {
  turnsToMessages,
  useEditorialChat,
  type ChatTurn,
} from '@/api/editorialChat'
import { buildLLMClient, LLMNotConfiguredError } from './llmClientFromConfig'

const SYSTEM_PROMPT =
  'You are galley\'s editorial assistant. The author is working on the current chapter; ' +
  'your job is to help them strengthen prose, find voice issues, and suggest rewrites. ' +
  'Keep replies short. Quote the passage you\'re commenting on. When suggesting an edit, ' +
  'always show the rewrite as a clear before/after.'

export interface EditorialChatPanelProps {
  bookId: string
  chapterId: string
  chapterTitle?: string
}

/**
 * Right-docked editorial chat panel. Toggled by ⌘K / Ctrl+K.
 *
 * Per-chapter conversation; turns persist to
 * `<bookRoot>/.galley/chats/<chapterId>.json` via the book-server
 * sidecar endpoints. Loads on mount, debounces writes after edits.
 *
 * MVP scope (Phase 1): plain chat with streaming. Slash commands,
 * @-mentions, tool use, and inline edits land in subsequent phases.
 */
export function EditorialChatPanel({
  bookId,
  chapterId,
  chapterTitle,
}: EditorialChatPanelProps) {
  const visible = useChatPrefs((s) => s.visible)
  const enabled = useChatPrefs((s) => s.enabled)
  const setVisible = useChatPrefs((s) => s.setVisible)

  const chat = useEditorialChat((s) => s.chats[bookId]?.[chapterId])
  const load = useEditorialChat((s) => s.load)
  const appendTurn = useEditorialChat((s) => s.appendTurn)
  const patchTurn = useEditorialChat((s) => s.patchTurn)
  const clear = useEditorialChat((s) => s.clear)

  const slot = useApiConfig((s) => s.services.llm)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Load chat sidecar when the panel becomes visible (or the chapter changes).
  useEffect(() => {
    if (!enabled || !visible) return
    void load(bookId, chapterId)
  }, [enabled, visible, bookId, chapterId, load])

  // Auto-scroll to the latest turn.
  useEffect(() => {
    if (!visible || !scrollerRef.current) return
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [visible, chat?.turns.length])

  if (!enabled || !visible) return null

  const turns: ChatTurn[] = chat?.turns ?? []

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setErr(null)

    let client
    try {
      client = buildLLMClient(slot)
    } catch (e) {
      if (e instanceof LLMNotConfiguredError) {
        setErr(e.message)
      } else {
        setErr((e as Error).message)
      }
      return
    }

    setDraft('')
    appendTurn(bookId, chapterId, { role: 'user', content: text })
    const assistantId = appendTurn(bookId, chapterId, {
      role: 'assistant',
      content: '',
      streaming: true,
    })
    setSending(true)
    abortRef.current = new AbortController()
    let acc = ''

    try {
      // Re-read latest turns so the user turn we just appended is included.
      const latestTurns = useEditorialChat.getState().chats[bookId]?.[chapterId]?.turns ?? []
      const messages = turnsToMessages(
        latestTurns.filter((t) => t.id !== assistantId),
      )

      for await (const delta of client.client.sendStreaming(messages, {
        system: SYSTEM_PROMPT,
        model: client.model,
        signal: abortRef.current.signal,
      })) {
        if (delta.textDelta) {
          acc += delta.textDelta
          patchTurn(bookId, chapterId, assistantId, { content: acc })
        }
        if (delta.final) {
          patchTurn(bookId, chapterId, assistantId, {
            content: delta.final.text,
            streaming: false,
          })
        }
      }
      patchTurn(bookId, chapterId, assistantId, { streaming: false })
    } catch (e) {
      const msg = (e as Error).message ?? 'LLM call failed'
      patchTurn(bookId, chapterId, assistantId, {
        content: acc || '(no response)',
        streaming: false,
        error: msg,
      })
      setErr(msg)
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  return (
    <aside className="chat-panel" data-chat-panel>
      <header className="chat-panel-header">
        <div className="chat-panel-title">
          <span className="chat-panel-eyebrow">Editorial chat</span>
          {chapterTitle ? (
            <span className="chat-panel-chapter">{chapterTitle}</span>
          ) : null}
        </div>
        <div className="chat-panel-actions">
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => {
              if (confirm('Clear all chat turns for this chapter?')) {
                void clear(bookId, chapterId)
              }
            }}
            title="Clear chapter chat"
            disabled={turns.length === 0}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => setVisible(false)}
            title="Close (Esc)"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="chat-panel-scroller" ref={scrollerRef}>
        {turns.length === 0 ? (
          <div className="chat-panel-empty">
            <p>Start a conversation about this chapter. Try:</p>
            <ul>
              <li>“What stands out as weak in this chapter?”</li>
              <li>“Tighten the first paragraph.”</li>
              <li>“Where am I overusing the staff-history frame?”</li>
            </ul>
            <p className="chat-panel-hint">⌘K / Ctrl+K toggles this panel.</p>
          </div>
        ) : (
          <ol className="chat-turn-list">
            {turns.map((t) => (
              <li key={t.id} className={`chat-turn chat-turn-${t.role}`}>
                <header className="chat-turn-role">
                  {t.role === 'user' ? 'You' : t.role === 'assistant' ? 'Galley' : 'System'}
                </header>
                <div className="chat-turn-content">
                  {t.content || (t.streaming ? '…' : '')}
                  {t.streaming ? <Loader2 size={11} className="chat-spinner" aria-hidden="true" /> : null}
                </div>
                {t.error ? (
                  <div className="chat-turn-error">
                    <AlertTriangle size={11} aria-hidden="true" /> {t.error}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {err ? (
        <div className="chat-panel-error">
          <AlertTriangle size={12} aria-hidden="true" /> {err}
        </div>
      ) : null}

      <form
        className="chat-panel-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
      >
        <textarea
          className="chat-panel-input"
          placeholder="Ask about this chapter…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend()
            }
          }}
          rows={3}
          disabled={sending}
        />
        {sending ? (
          <button type="button" className="chat-send-btn" onClick={handleStop}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!draft.trim()}
            title="Send (⌘↵)"
          >
            <Send size={13} aria-hidden="true" />
            <span>Send</span>
          </button>
        )}
      </form>
    </aside>
  )
}
