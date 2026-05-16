import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { mountDesktopIntegration } from '../desktopIntegration'

/**
 * Top-of-tree layout that wires the Tauri desktop shell into react-
 * router. In a browser session mountDesktopIntegration is a no-op
 * (the isTauri() check fails), so this layout is invisible to the
 * web build.
 */
export default function RootLayout() {
  const navigate = useNavigate()
  const unmountRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void mountDesktopIntegration(navigate).then((unmount) => {
      if (cancelled) {
        unmount()
      } else {
        unmountRef.current = unmount
      }
    })
    return () => {
      cancelled = true
      unmountRef.current?.()
      unmountRef.current = undefined
    }
  }, [navigate])

  return <Outlet />
}
