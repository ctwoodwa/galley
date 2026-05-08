import { useState, useCallback } from 'react'

export function useFavorites(storageKey: string) {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const toggle = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        localStorage.setItem(storageKey, JSON.stringify([...next]))
        return next
      })
    },
    [storageKey],
  )

  return { favorites, toggle }
}
