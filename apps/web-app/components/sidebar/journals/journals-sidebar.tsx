"use client"

import { useVirtualList } from "ahooks"
import { useEffect, useMemo, useRef } from "react"
import useInfiniteScroll from "react-infinite-scroll-hook"

import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { useJournalsSidebarData } from "./use-journals"

const formatDate = (dayId: string) => {
  const date = new Date(dayId)
  if (Number.isNaN(date.getTime())) return dayId
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

type VirtualRow =
  | { type: "section"; label: string }
  | { type: "day"; id: string }

export const JournalsSidebar = () => {
  const {
    currentDay,
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
  } = useJournalsSidebarData()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const virtualData: VirtualRow[] = useMemo(() => {
    const rows: VirtualRow[] = []
    if (search) {
      if (searchResults.length) {
        rows.push({ type: "section", label: "Search" })
        searchResults.forEach((item) => rows.push({ type: "day", id: item.id }))
      }
      return rows
    }
    const pushSection = (label: string, items: { id: string }[]) => {
      if (!items.length) return
      rows.push({ type: "section", label })
      items.forEach((item) => rows.push({ type: "day", id: item.id }))
    }
    pushSection("Today", sections.today)
    pushSection("Yesterday", sections.yesterday)
    pushSection("Earlier", sections.earlier)
    return rows
  }, [search, searchResults, sections])

  const [virtualList, scrollTo] = useVirtualList(virtualData, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: (index) => (virtualData[index]?.type === "section" ? 28 : 92),
    overscan: 12,
  })

  // Scroll to a given day id when receiving custom event
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      const targetId = detail?.id
      if (!targetId || !scrollTo || !virtualData.length) return
      const idx = virtualData.findIndex(
        (row) => row.type === "day" && row.id === targetId
      )
      if (idx >= 0) {
        const targetIdx = Math.max(0, idx - 3) // approximate centering
        scrollTo(targetIdx)
      }
    }
    window.addEventListener("journals-scroll-to-day", handler as EventListener)
    return () =>
      window.removeEventListener("journals-scroll-to-day", handler as EventListener)
  }, [scrollTo, virtualData])

  const [sentryRef] = useInfiniteScroll({
    loading,
    hasNextPage: !!hasNextPage,
    onLoadMore: handleLoadMore,
    disabled: !!search,
    rootMargin: "0px 0px 240px 0px",
  })

  const renderSection = (label: string) => (
    <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
  )

  // Ctrl/Cmd + F to focus search input (similar to nodes header)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className="flex h-full w-full flex-col px-3 py-2">
      <div className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">
        Journals
      </div>
      <div className="mb-2 px-1">
        <Input
          placeholder="Search journals"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
          ref={inputRef}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {loading && !days.length ? (
          <div className="space-y-3 px-1">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
        ) : search && searchLoading ? (
          <div className="space-y-3 px-1">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full w-full overflow-y-auto pr-1"
          >
            <div ref={wrapperRef} className="space-y-2">
              {virtualData.length ? (
                virtualList.map((item) => {
                  const data = item.data
                  const itemRef = (item as any).ref
                  if (data.type === "section") {
                    return (
                      <div key={`section-${data.label}`} ref={itemRef}>
                        {renderSection(data.label)}
                      </div>
                    )
                  }
                  const id = data.id
                  const titleHighlight = search
                    ? searchTitleHighlights[id]
                    : undefined
                  const contentHighlight = search
                    ? searchContentHighlights[id]
                    : undefined
                  const snippet = contentHighlight ?? previews[id]
                  const isActive = activeDay === id || currentDay === id
                  return (
                    <div key={id} ref={itemRef}>
                      <button
                        onClick={(event) =>
                          handleOpen(id, {
                            target: event.altKey ? "_blank" : undefined,
                          })
                        }
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left",
                          isActive
                            ? "border-primary/70 bg-primary/10"
                            : "bg-muted/30 hover:bg-accent/40 hover:border-border transition-colors duration-100"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {titleHighlight ? (
                              <span
                                className="[&_b]:text-destructive [&_b]:font-semibold"
                                dangerouslySetInnerHTML={{
                                  __html: titleHighlight,
                                }}
                              />
                            ) : (
                              id
                            )}
                          </span>
                          <span>{formatDate(id)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                          {snippet !== undefined ? (
                            contentHighlight ? (
                              <span
                                className="[&_b]:text-destructive [&_b]:font-semibold"
                                dangerouslySetInnerHTML={{
                                  __html: contentHighlight,
                                }}
                              />
                            ) : (
                              snippet || "No content yet"
                            )
                          ) : (
                            <Skeleton className="h-4 w-full" />
                          )}
                        </div>
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  {search ? "No results." : "No journals yet."}
                </div>
              )}
              {hasNextPage && !search && (
                <div
                  ref={sentryRef}
                  className="py-3 text-center text-xs text-muted-foreground"
                >
                  {loading ? "Loading..." : "Load older journals"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
