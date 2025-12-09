"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getToday, getYesterday } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAllDays } from "@/apps/web-app/pages/[database]/journals/hooks"

const MAX_PREVIEW_COUNT = 40

const buildSnippet = (markdown: string) => {
  if (!markdown) return ""
  // strip simple markdown markers to make a lightweight preview
  const text = markdown
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-\[\]\(\)]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

export const useJournalsSidebarData = () => {
  const { space } = useCurrentPathInfo()
  const { navigate, params } = useRouterAdapter()
  const currentDay = (params.day as string | undefined) || getToday()
  const {
    getDocMarkdown,
    getDocMarkdownBatch,
    fullTextSearch,
    searchDayPages,
  } = useSqlite(space)
  const { days, loading, hasNextPage, loadMore } = useAllDays(space)

  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [searchTitleHighlights, setSearchTitleHighlights] = useState<
    Record<string, string>
  >({})
  const [searchContentHighlights, setSearchContentHighlights] = useState<
    Record<string, string>
  >({})
  const [activeDay, setActiveDay] = useState<string>(currentDay)
  const fetchedRef = useMemo(() => new Set<string>(), [])
  const [search, setSearch] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<
    { id: string; result?: string }[]
  >([])

  const today = getToday()
  const yesterday = getYesterday()

  useEffect(() => {
    setActiveDay(currentDay)
  }, [currentDay])



  const handleLoadMore = useCallback(async () => {
    try {
      await loadMore()
    } catch (err) {
      console.warn("[TodaySidebar] loadMore error", err)
    }
  }, [hasNextPage, loadMore, loading])

  const handleOpen = useCallback(
    (dayId: string) => {
      setActiveDay(dayId)
      navigate(`/journals/${dayId}`)
    },
    [navigate]
  )

  // Prefetch lightweight snippets for the most recent days to render list cards
  useEffect(() => {
    let cancelled = false
    const fetchPreviews = async () => {
      if (!getDocMarkdown) return
      const targetIds = days
        .map((d) => d.id)
        .filter((id) => !fetchedRef.has(id))
        .slice(0, MAX_PREVIEW_COUNT)

      if (!targetIds.length) return
      let entries: [string, string][] = []
      try {
        if (getDocMarkdownBatch) {
          const batchRes = await getDocMarkdownBatch(targetIds)
          entries = batchRes.map(
            (item: { id: string; markdown: string }) => [
              item.id,
              buildSnippet(item.markdown || ""),
            ]
          )
        } else {
          // Fallback: sequential fetch (should rarely happen)
          entries = await Promise.all(
            targetIds.map(async (id): Promise<[string, string]> => {
              try {
                const markdown = await getDocMarkdown(id)
                return [id, buildSnippet(markdown || "")]
              } catch (error) {
                console.warn("Failed to load journal preview", error)
                return [id, ""]
              }
            })
          )
        }
      } catch (error) {
        console.warn("[TodaySidebar] Failed to batch load journal previews", error)
        entries = targetIds.map((id) => [id, ""])
      }

      if (cancelled) return

      setPreviews((prev) => {
        const next = { ...prev }
        entries.forEach(([id, snippet]) => {
          next[id] = snippet
          fetchedRef.add(id)
        })
        return next
      })
    }

    fetchPreviews()
    return () => {
      cancelled = true
    }
  }, [days, getDocMarkdown, fetchedRef, getDocMarkdownBatch])

  const highlightId = (id: string, term: string) => {
    if (!term) return id
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(escaped, "gi")
    return id.replace(re, (m) => `<b>${m}</b>`)
  }

  // Backend search combining full-text (highlight) + id LIKE (supports fragments e.g. 2025-12 / 12-05)
  useEffect(() => {
    let cancelled = false
    if (!search) {
      setSearchResults([])
      setSearchTitleHighlights({})
      setSearchContentHighlights({})
      setSearchLoading(false)
      return
    }
    const handler = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const [ftsRes, idLikeRes] = await Promise.all([
          fullTextSearch ? fullTextSearch(search) : Promise.resolve([]),
          searchDayPages ? searchDayPages(search, 0, 50) : Promise.resolve([]),
        ])

        if (cancelled) return

        const merged: { id: string; result?: string }[] = []
        const titleHighlights: Record<string, string> = {}
        const contentHighlights: Record<string, string> = {}
        const seen = new Set<string>()

        // prefer full-text results (with backend highlight)
        for (const item of ftsRes as any[]) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          merged.push({ id: item.id, result: item.result })
          if (item.result) {
            contentHighlights[item.id] = item.result
          }
          // also highlight id fragment if present in title
          const hlId = highlightId(item.id, search)
          if (hlId !== item.id) {
            titleHighlights[item.id] = hlId
          }
        }

        // add ID/markdown LIKE results if not already present
        for (const item of idLikeRes as any[]) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          merged.push({ id: item.id })
          const hl = highlightId(item.id, search)
          titleHighlights[item.id] = hl
        }

        if (cancelled) return

        setSearchResults(merged)
        setSearchTitleHighlights(titleHighlights)
        setSearchContentHighlights(contentHighlights)

        // cache snippets from id-like markdown results to avoid refetch
        setPreviews((prev) => {
          const next = { ...prev }
            ; (idLikeRes as any[]).forEach((item) => {
              if (item.markdown !== undefined) {
                next[item.id] = buildSnippet(item.markdown || "")
              }
            })
          return next
        })
      } catch (error) {
        if (!cancelled) {
          console.warn("fullTextSearch failed", error)
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(handler)
    }
  }, [search, fullTextSearch, searchDayPages])

  const sections = useMemo(
    () => ({
      today: days.filter((d) => d.id === today),
      yesterday: days.filter((d) => d.id === yesterday),
      earlier: days.filter((d) => d.id !== today && d.id !== yesterday),
    }),
    [days, today, yesterday]
  )

  return {
    currentDay,
    today,
    yesterday,
    days,
    loading,
    hasNextPage,
    handleLoadMore,
    handleOpen,
    previews,
    searchTitleHighlights,
    searchContentHighlights,
    activeDay,
    setActiveDay,
    search,
    setSearch,
    searchLoading,
    searchResults,
    sections,
  }
}

