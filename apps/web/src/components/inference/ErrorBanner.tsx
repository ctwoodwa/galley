interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div role="alert" className="flex items-start gap-3 bg-red-950/80 border border-red-800/60 text-red-300 rounded-lg px-4 py-3 text-sm">
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="text-red-500 hover:text-red-300 font-bold leading-none text-lg transition-colors"
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  )
}
