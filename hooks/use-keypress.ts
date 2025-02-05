import { useEffect } from 'react'

export function useKeypress(key: string, callback: (event: KeyboardEvent) => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        callback(event)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [callback, key])
} 