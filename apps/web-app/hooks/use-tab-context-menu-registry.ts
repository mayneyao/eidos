import { create } from "zustand"
import { useEffect, useRef } from "react"

export interface TabContextMenuItem {
  id: string
  label?: string
  Icon?: React.ComponentType<{ className?: string }>
  onClick?: () => void
  render?: () => React.ReactNode
}

interface Store {
  itemsByUrl: Record<string, TabContextMenuItem[]>
}

const useStore = create<Store>(() => ({
  itemsByUrl: {},
}))

let regCounter = 0

export function useRegisterTabContextMenuItem(
  urlMatcher: string,
  item: TabContextMenuItem
) {
  const itemRef = useRef(item)
  itemRef.current = item
  const regId = useRef(++regCounter).current

  useEffect(() => {
    const stableItem = {
      ...itemRef.current,
      // Attach a unique registration id so multiple tabs
      // with the same urlMatcher+id don't collide.
      __regId: regId,
      onClick: () => itemRef.current.onClick?.(),
    }

    const state = useStore.getState()
    const existing = state.itemsByUrl[urlMatcher] || []
    // Replace any previous registration with the same regId
    // (React StrictMode double-render creates two effects for the same regId)
    const filtered = existing.filter((i: any) => i.__regId !== regId)

    useStore.setState({
      itemsByUrl: {
        ...state.itemsByUrl,
        [urlMatcher]: [...filtered, stableItem],
      },
    })

    return () => {
      const s = useStore.getState()
      const current = s.itemsByUrl[urlMatcher] || []
      // Remove only our own registration, not other tabs' items with the same id
      const remaining = current.filter((i: any) => i.__regId !== regId)
      useStore.setState({
        itemsByUrl: {
          ...s.itemsByUrl,
          ...(remaining.length > 0 ? { [urlMatcher]: remaining } : {}),
        },
      })
    }
  }, [urlMatcher])
}

export function useTabContextMenuItems(tabUrl: string): TabContextMenuItem[] {
  return useStore((state) => {
    if (state.itemsByUrl[tabUrl]) return state.itemsByUrl[tabUrl]
    for (const [key, items] of Object.entries(state.itemsByUrl)) {
      if (tabUrl.startsWith(key)) return items
    }
    return []
  })
}
