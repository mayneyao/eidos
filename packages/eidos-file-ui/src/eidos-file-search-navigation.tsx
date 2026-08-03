import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type EidosFileSearchNavigationDirection = "next" | "previous"

export interface EidosFileSearchNavigationState {
  searchResultCount: number | null
  searchResultIndex: number | null
  navigateSearchResults(direction: EidosFileSearchNavigationDirection): void
  reportSearchResultCount(rowCount: number | null): void
}

interface EidosFileSearchResultState {
  key: string
  count: number | null
  index: number
}

const EidosFileSearchNavigationContext =
  createContext<EidosFileSearchNavigationState | null>(null)

/**
 * Owns result counting and cyclic navigation for one Eidos File editor surface.
 * The query toolbar and active view discover this scope automatically.
 */
export function EidosFileSearchNavigationProvider({
  search,
  scopeKey,
  children,
}: {
  search: string
  scopeKey: string
  children: ReactNode
}) {
  const normalizedSearch = search.trim()
  const resultKey = `${scopeKey}\u0000${normalizedSearch}`
  const currentKeyRef = useRef(resultKey)
  currentKeyRef.current = resultKey
  const [result, setResult] = useState<EidosFileSearchResultState>({
    key: resultKey,
    count: null,
    index: 0,
  })
  const current =
    result.key === resultKey
      ? result
      : { key: resultKey, count: null, index: 0 }
  const searchResultIndex =
    normalizedSearch && current.count !== null && current.count > 0
      ? Math.min(current.index, current.count - 1)
      : null

  const reportSearchResultCount = useCallback(
    (rowCount: number | null) => {
      if (currentKeyRef.current !== resultKey) return
      setResult((previous) => {
        const active =
          previous.key === resultKey
            ? previous
            : { key: resultKey, count: null, index: 0 }
        return {
          key: resultKey,
          count: rowCount,
          index:
            rowCount !== null && rowCount > 0
              ? Math.min(active.index, rowCount - 1)
              : 0,
        }
      })
    },
    [resultKey]
  )

  const navigateSearchResults = useCallback(
    (direction: EidosFileSearchNavigationDirection) => {
      if (currentKeyRef.current !== resultKey) return
      setResult((previous) => {
        if (
          previous.key !== resultKey ||
          previous.count === null ||
          previous.count < 1
        ) {
          return previous
        }
        return {
          ...previous,
          index:
            direction === "next"
              ? (previous.index + 1) % previous.count
              : (previous.index - 1 + previous.count) % previous.count,
        }
      })
    },
    [resultKey]
  )

  const value = useMemo<EidosFileSearchNavigationState>(
    () => ({
      searchResultCount:
        normalizedSearch && current.count !== null ? current.count : null,
      searchResultIndex,
      navigateSearchResults,
      reportSearchResultCount,
    }),
    [
      current.count,
      navigateSearchResults,
      normalizedSearch,
      reportSearchResultCount,
      searchResultIndex,
    ]
  )

  return (
    <EidosFileSearchNavigationContext.Provider value={value}>
      {children}
    </EidosFileSearchNavigationContext.Provider>
  )
}

/** Returns the nearest editor search scope, if one is installed. */
export function useEidosFileSearchNavigation(): EidosFileSearchNavigationState | null {
  return useContext(EidosFileSearchNavigationContext)
}
