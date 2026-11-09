import { useEffect, useMemo, useRef, useState } from "react"
import type { SpaceTreeEntry } from "../shared/contracts"
import type {
  ExplorerFilesPage,
  ExplorerFilesQuery,
} from "../shared/explorer-file-list"
import {
  explorerFilterSignature,
  type ExplorerFileFilter,
} from "./explorer-file-filter"
import type { ExplorerSort } from "./explorer-sort"
const EMPTY_FILES: SpaceTreeEntry[] = []

export function useExplorerRecentFiles(options: {
  spaceId: string
  directory: string | null
  filter: ExplorerFileFilter
  sort: ExplorerSort
  sinceMs: number
  visible: boolean
  refreshKey: object | string
  respectGitignore?: boolean
}) {
  const context = JSON.stringify([options.spaceId, options.directory])
  const signature = explorerFilterSignature(options.filter)
  const key = useMemo(
    () => ({}),
    [
      context,
      signature,
      options.sort.by,
      options.sort.direction,
      options.sinceMs,
      options.refreshKey,
      options.respectGitignore,
    ]
  )
  const [recent, setRecent] = useState<{
    context: string
    key: object
    page: ExplorerFilesPage
  } | null>(null)
  const [earlier, setEarlier] = useState<{
    context: string
    key: object
    page: ExplorerFilesPage
  } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [retryToken, setRetryToken] = useState(0)
  const ready = useRef<object | null>(null)
  const moreRequest = useRef(0)
  const moreBusy = useRef(false)
  const latestKey = useRef(key)
  latestKey.current = key
  const query = (
    period: ExplorerFilesQuery["period"],
    offset = 0
  ): ExplorerFilesQuery => ({
    directory: options.directory,
    filter: options.filter,
    sort: options.sort,
    sinceMs: options.sinceMs,
    period,
    offset,
    respectGitignore: options.respectGitignore !== false,
  })
  useEffect(() => {
    setExpanded(false)
  }, [context])
  useEffect(() => {
    if (!options.visible || ready.current === key) return
    let active = true
    setLoading(true)
    setError(undefined)
    void window.eidosLite
      .listExplorerFiles(query("recent"))
      .then(
        (page) => {
          if (!active) return
          ready.current = key
          setRecent({ context, key, page })
        },
        (cause: unknown) => {
          if (active)
            setError(cause instanceof Error ? cause.message : String(cause))
        }
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [key, options.visible, retryToken])
  useEffect(() => {
    moreRequest.current += 1
    moreBusy.current = false
    setLoadingMore(false)
  }, [key])
  const loadEarlier = async (append = true) => {
    if (moreBusy.current || recent?.key !== key) return
    moreBusy.current = true
    setLoadingMore(true)
    setError(undefined)
    const request = ++moreRequest.current
    const previous = append && earlier?.key === key ? earlier.page.entries : []
    try {
      const page = await window.eidosLite.listExplorerFiles(
        query("earlier", previous.length)
      )
      if (request !== moreRequest.current || latestKey.current !== key) return
      const unique = new Map(
        [...previous, ...page.entries].map((entry) => [
          entry.relativePath,
          entry,
        ])
      )
      setEarlier({
        context,
        key,
        page: { ...page, entries: [...unique.values()] },
      })
    } catch (cause) {
      if (request === moreRequest.current && latestKey.current === key)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request === moreRequest.current) {
        moreBusy.current = false
        setLoadingMore(false)
      }
    }
  }
  useEffect(() => {
    if (
      options.visible &&
      expanded &&
      recent?.key === key &&
      earlier?.key !== key
    )
      void loadEarlier(false)
  }, [expanded, key, recent?.key, options.visible])
  useEffect(
    () => () => {
      moreRequest.current += 1
    },
    []
  )
  const current = recent?.context === context ? recent.page : null
  const older = earlier?.context === context ? earlier.page : null
  return {
    entries: current?.entries ?? EMPTY_FILES,
    earlier: older?.entries ?? EMPTY_FILES,
    earlierCount: current?.earlierCount ?? 0,
    hasMore: older?.hasMore ?? true,
    expanded,
    setExpanded,
    loading: loading || (options.visible && recent?.key !== key && !error),
    loadingMore,
    error,
    retry: () => {
      ready.current = null
      setEarlier(null)
      setRetryToken((value) => value + 1)
    },
    loadMore: () => void loadEarlier(),
  }
}
