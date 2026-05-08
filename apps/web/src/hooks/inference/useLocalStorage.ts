import { useState, useEffect, useRef } from 'react'

export function useLocalStorage<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s !== null ? (JSON.parse(s) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const keyRef = useRef(key)
  useEffect(() => { keyRef.current = key }, [key])

  useEffect(() => {
    try {
      localStorage.setItem(keyRef.current, JSON.stringify(value))
    } catch {}
  }, [value])

  return [value, setValue]
}
