import { useEffect } from 'react'

interface DeleteConfirmDialogProps {
  voiceId: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({ voiceId, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="bg-stone-900 border border-stone-700 rounded-xl p-6 w-80 flex flex-col gap-4 shadow-2xl"
      >
        <h2 id="delete-dialog-title" className="text-stone-100 font-semibold">Delete voice</h2>
        <p className="text-sm text-stone-400 leading-relaxed">
          Delete <span className="font-mono text-stone-200">{voiceId}</span>? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            autoFocus
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-700 hover:bg-red-600 text-white transition-colors font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
