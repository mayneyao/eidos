import { createContext, useContext, useMemo, type ReactNode } from "react"

interface SearchFocusScope {
  registerTarget(target: () => void): () => void
  restoreFocus(): boolean
}

const SearchFocusContext = createContext<SearchFocusScope | null>(null)

/** Private focus handoff between the search toolbar and its mounted view. */
export function EidosFileSearchFocusProvider({
  scopeKey,
  children,
}: {
  scopeKey: string
  children: ReactNode
}) {
  const scope = useMemo<SearchFocusScope>(() => {
    let target: (() => void) | null = null
    return {
      registerTarget(next) {
        target = next
        return () => {
          if (target === next) target = null
        }
      },
      restoreFocus() {
        if (!target) return false
        target()
        return true
      },
    }
  }, [scopeKey])
  return (
    <SearchFocusContext.Provider value={scope}>
      {children}
    </SearchFocusContext.Provider>
  )
}

export function useEidosFileSearchFocus() {
  return useContext(SearchFocusContext)
}
