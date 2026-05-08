import { useRef } from 'react'
import { useLocalStorage } from './useLocalStorage'

interface Options {
  min?: number
  max?: number
  defaultWidth?: number
}

export function useResizable(storageKey: string, { min = 200, max = 560, defaultWidth = 300 }: Options = {}) {
  const [width, setWidth] = useLocalStorage(storageKey, defaultWidth)
  const startRef = useRef({ x: 0, w: 0 })

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    startRef.current = { x: e.clientX, w: width }

    function onMove(ev: MouseEvent) {
      setWidth(Math.max(min, Math.min(max, startRef.current.w + ev.clientX - startRef.current.x)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return { width, onMouseDown }
}
