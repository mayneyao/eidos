/**
 * Journal sidebar data hook
 * Refactored to use eidos.currentSpace APIs
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  useEidos,
  useExtensionContext,
  type SidebarBlockContext,
} from "@eidos.space/react"

import { buildSnippet, getToday, getYesterday } from "./utils"

const MAX_PREVIEW_COUNT = 40
const EACH_PAGE_SIZE = 7

type IDay = {
  id: string
}

export const useJournalsSidebarData = () => {
  const eidos = useEidos()
  const space = eidos.currentSpace
  const ctx = useExtensionContext<SidebarBlockContext>()
  const currentDay = ctx.currentDay || getToday()

  const [days, setDays] = useState<IDay[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [loading, setLoading] = useState(false)

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

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      const initialDays = await space.listDays(0)
      const existDays = initialDays.map((d: any) => d.id)
      let _days: IDay[] = [...initialDays]

      if (!existDays.includes(today)) {
        _days.push({ id: today })
      }

      _days.sort((a, b) => {
        return new Date(b.id).getTime() - new Date(a.id).getTime()
      })

      setDays(_days)
    }
    loadInitial()
  }, [space, today])

  const handleLoadMore = useCallback(async () => {
    if (loading) return

    setLoading(true)
    try {
      const res = await space.listDays(currentPage + 1)

      if (!res?.length) {
        setHasNextPage(false)
        return
      }

      setDays((prevDays) => {
        const existingIds = new Set(prevDays.map((d: IDay) => d.id))
        const newDays = res.filter((d: IDay) => !existingIds.has(d.id))
        return [...prevDays, ...newDays]
      })

      setCurrentPage(currentPage + 1)
      if (res.length < EACH_PAGE_SIZE) {
        setHasNextPage(false)
      }
    } finally {
      setLoading(false)
    }
  }, [currentPage, space, loading])

  const handleOpen = useCallback(
    (dayId: string, options?: { target?: "_blank" | "_self" }) => {
      if (options?.target !== "_blank") {
        setActiveDay(dayId)
      }
      // Use eidos.currentSpace.navigate for navigation
      space.navigate(`/journals/${dayId}`)
    },
    [space]
  )

  // Prefetch lightweight snippets for the most recent days
  useEffect(() => {
    let cancelled = false
    const fetchPreviews = async () => {
      const targetIds = days
        .map((d) => d.id)
        .filter((id) => !fetchedRef.has(id))
        .slice(0, MAX_PREVIEW_COUNT)

      if (!targetIds.length) return

      let entries: [string, string][] = []
      try {
        const batchRes = await space.lexical2markdownBatch(targetIds)
        entries = batchRes.map((item: { id: string; markdown: string }) => [
          item.id,
          buildSnippet(item.markdown || ""),
        ])
      } catch (error) {
        console.warn(
          "[JournalsSidebar] Failed to batch load journal previews",
          error
        )
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
  }, [days, space, fetchedRef])

  const highlightId = (id: string, term: string) => {
    if (!term) return id
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(escaped, "gi")
    return id.replace(re, (m) => `<b>${m}</b>`)
  }

  // Backend search combining full-text + id LIKE
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
          space.fullTextSearch(search),
          space.searchDayPages(search, 0, 50),
        ])

        if (cancelled) return

        const merged: { id: string; result?: string }[] = []
        const titleHighlights: Record<string, string> = {}
        const contentHighlights: Record<string, string> = {}
        const seen = new Set<string>()

        // Prefer full-text results (with backend highlight)
        for (const item of ftsRes as any[]) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          merged.push({ id: item.id, result: item.result })
          if (item.result) {
            contentHighlights[item.id] = item.result
          }
          const hlId = highlightId(item.id, search)
          if (hlId !== item.id) {
            titleHighlights[item.id] = hlId
          }
        }

        // Add ID/markdown LIKE results if not already present
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

        // Cache snippets from id-like markdown results
        setPreviews((prev) => {
          const next = { ...prev }
          ;(idLikeRes as any[]).forEach((item) => {
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
  }, [search, space])

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
