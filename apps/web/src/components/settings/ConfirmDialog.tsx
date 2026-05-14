import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual emphasis on the confirm button. `'destructive'` paints
   *  it in the rust-red destructive palette; `'default'` uses
   *  vermilion. */
  confirmKind?: 'default' | 'destructive'
}

/**
 * Modal confirm dialog in the editorial-letterpress register. Used
 * for actions where `window.confirm` is too anonymous — book removal,
 * Danger zone resets. Type-to-confirm (Danger zone pattern) is
 * deferred until Danger zone forces it.
 *
 * Behaviour:
 *   - Backdrop click → close.
 *   - Escape → close.
 *   - Enter → confirm.
 *   - Focus moves to the cancel button on open (safer default for
 *     destructive actions).
 *   - Portal-rendered to document.body so overflow:hidden parents
 *     don't clip the overlay.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmKind = 'default',
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void handleConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // handleConfirm referenced via closure — re-bind when open changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])

  const handleConfirm = async () => {
    setRunning(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  const node = (
    <div
      className="gs-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gs-dialog-title"
        className="gs-dialog galley-settings"
      >
        <h2 id="gs-dialog-title" className="gs-dialog-title">
          {title}
        </h2>
        {description ? (
          <div className="gs-dialog-description">{description}</div>
        ) : null}
        <div className="gs-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={running}
            className="gs-button"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={running}
            className={
              'gs-button ' +
              (confirmKind === 'destructive' ? 'destructive' : 'vermilion')
            }
          >
            {running ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : null}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
