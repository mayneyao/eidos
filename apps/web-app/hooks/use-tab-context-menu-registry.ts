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

export function useRegisterTabContextMenuItem(
  urlMatcher: string,
  item: TabContextMenuItem
) {
  const itemRef = useRef(item)
  itemRef.current = item

  useEffect(() => {
    const stableItem = {
      ...itemRef.current,
      onClick: () => itemRef.current.onClick?.(),
    }

    const state = useStore.getState()
    const existing = state.itemsByUrl[urlMatcher] || []
    const filtered = existing.filter((i) => i.id !== stableItem.id)
    useStore.setState({
      itemsByUrl: {
        ...state.itemsByUrl,
        [urlMatcher]: [...filtered, stableItem],
      },
    })

    return () => {
      const s = useStore.getState()
      const current = s.itemsByUrl[urlMatcher] || []
      const remaining = current.filter((i) => i.id !== stableItem.id)
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
