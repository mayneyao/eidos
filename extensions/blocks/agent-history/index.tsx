"use sidebar"

import { PlusIcon, Trash2Icon, MessageSquareIcon } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualList } from "ahooks"
import { useEidos } from "@eidos.space/react"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import {
  deleteSession,
  fetchSessions,
  searchSessions,
  useAgentStore,
  type SessionSearchResult,
} from "@/components/ai-agent/agent-store"

/**
 * Extension metadata
 */
export const meta = {
  type: "sidebarBlock",
  componentName: "AgentHistorySidebar",
  icon: "message-square",
  sidebarBlock: {
    title: "AI Agent History",
    description: "View and manage your AI Agent conversation history.",
  },
}

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ")

const Input = ({
  ref,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}) => (
  <input
    ref={ref}
    {...props}
    className={cn(
      "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      props.className
    )}
  />
)

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-muted", className)} />
)

const highlightText = (text: string, term: string) => {
  if (!term) return text
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(escaped, "gi")
  return text.replace(re, (m) => `<b>${m}</b>`)
}

const CARD_HEIGHT = 68

export function AgentHistorySidebar() {
  const { space } = useCurrentPathInfo()
  const eidos = useEidos()
  const { sessions, setSessions, currentSessionId, setCurrentSession } =
    useAgentStore()
  const [loading, setLoading] = useState(false)

  // Search state
  const [search, setSearch] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Virtual list data source
  const items = search ? searchResults : sessions
  const virtualData = useMemo(() => items, [items])

  const [virtualList] = useVirtualList(virtualData, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: CARD_HEIGHT,
    overscan: 8,
  })

  // Reset selectedIndex when results or search mode change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchResults, search])

  const refreshSessions = useCallback(async () => {
    if (!space) return
    setLoading(true)
    const data = await fetchSessions()
    setSessions(data)
    setLoading(false)
  }, [space, setSessions])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  // Debounced search
  useEffect(() => {
    if (!search) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    let cancelled = false
    const handler = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await searchSessions(search)
        if (!cancelled) setSearchResults(results)
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(handler)
    }
  }, [search])

  // Ctrl/Cmd + F to focus search input
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (search) {
        const r = searchResults[selectedIndex]
        if (r) handleSelectSession(r.sessionId)
      } else {
        const s = sessions[selectedIndex]
        if (s) handleSelectSession(s.id)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setSearch("")
    }
  }

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!containerRef.current) return
    const selected = containerRef.current.querySelector("[data-selected=true]")
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const handleSelectSession = useCallback(
    (id: string | null, options?: { target?: "_blank" | "_self" }) => {
      const path = id ? `/agent/${id}` : `/agent`
      if (options?.target !== "_blank") {
        setCurrentSession(id)
      }
      eidos.currentSpace.navigate(path)
    },
    [eidos.currentSpace, setCurrentSession]
  )

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (!space || !confirm("Are you sure you want to delete this session?"))
        return

      const success = await deleteSession(id)
      if (success) {
        if (currentSessionId === id) {
          handleSelectSession(null)
        }
        refreshSessions()
      }
    },
    [space, currentSessionId, handleSelectSession, refreshSessions]
  )

  const renderSearchResultCard = (r: SessionSearchResult, idx: number) => {
    const isActive = currentSessionId === r.sessionId
    const isSelected = idx === selectedIndex
    const goalHighlight = highlightText(r.goal || "New Conversation", search)
    const hasGoalMatch = (r.goal || "")
      .toLowerCase()
      .includes(search.toLowerCase())
    const snippet = (r.snippets ?? []).find(
      (s) => !hasGoalMatch || s.content !== r.goal
    )

    return (
      <div
        key={r.sessionId}
        data-selected={isSelected || undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(idx)
          handleSelectSession(r.sessionId, {
            target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
          })
        }}
        className={cn(
          "group relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200",
          isSelected
            ? "border-primary/70 bg-primary/10"
            : isActive
              ? "border-primary/50 bg-primary/5 shadow-sm"
              : "border-transparent hover:bg-muted/50"
        )}
      >
        <div className="flex items-start gap-2 overflow-hidden">
          <div className="mt-0.5 shrink-0">
            {isActive ? (
              <MessageSquareIcon className="h-3.5 w-3.5 text-primary" />
            ) : (
              <MessageSquareIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
          </div>
          <span
            className={cn(
              "text-xs font-medium truncate leading-relaxed [&_b]:text-destructive [&_b]:font-semibold",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
            dangerouslySetInnerHTML={{ __html: goalHighlight }}
          />
        </div>
        {snippet && (
          <div className="pl-5.5 text-[11px] text-muted-foreground/70 line-clamp-2">
            <span
              className="[&_b]:text-destructive [&_b]:font-semibold"
              dangerouslySetInnerHTML={{
                __html: highlightText(snippet.content, search),
              }}
            />
          </div>
        )}
        <div className="flex items-center gap-2 pl-5.5 text-[10px] text-muted-foreground/60">
          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span className="capitalize">{r.status}</span>
        </div>
      </div>
    )
  }

  const renderSessionCard = (s: (typeof sessions)[number], idx: number) => {
    const isActive = currentSessionId === s.id
    const isSelected = idx === selectedIndex
    return (
      <div
        key={s.id}
        data-selected={isSelected || undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(idx)
          handleSelectSession(s.id, {
            target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
          })
        }}
        className={cn(
          "group relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200",
          isSelected
            ? "border-primary/70 bg-primary/10"
            : isActive
              ? "border-primary/50 bg-primary/5 shadow-sm"
              : "border-transparent hover:bg-muted/50"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 overflow-hidden flex-1">
            <div className="mt-0.5 shrink-0">
              {isActive ? (
                <MessageSquareIcon className="h-3.5 w-3.5 text-primary" />
              ) : (
                <MessageSquareIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium truncate leading-relaxed",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s.goal || "New Conversation"}
            </span>
          </div>
          <button
            onClick={(e) => handleDeleteSession(e, s.id)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all shrink-0"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 pl-5.5 text-[10px] text-muted-foreground/60">
          <span>{new Date(s.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span className="capitalize">{s.status}</span>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (search) {
      if (searchLoading) {
        return (
          <div className="space-y-2 px-1">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        )
      }
      if (searchResults.length === 0) {
        return (
          <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No results.
          </div>
        )
      }
    } else {
      if (loading && sessions.length === 0) {
        return (
          <div className="px-1 py-4 text-xs text-muted-foreground animate-pulse">
            Loading history...
          </div>
        )
      }
      if (sessions.length === 0) {
        return (
          <div className="px-1 py-8 text-center border border-dashed rounded-lg">
            <p className="text-xs text-muted-foreground">No history yet.</p>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleSelectSession(null, {
                  target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
                })
              }}
              className="mt-2 text-xs text-primary font-medium hover:underline"
            >
              Start first session
            </button>
          </div>
        )
      }
    }

    return (
      <div ref={containerRef} className="h-full w-full overflow-y-auto pr-1">
        <div ref={wrapperRef} className="space-y-1">
          {virtualList.map((item) => {
            const idx = item.index
            const data = item.data
            if (search) {
              return renderSearchResultCard(data, idx)
            }
            return renderSessionCard(data, idx)
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col px-3 py-2 overflow-hidden">
      <div className="mb-2 px-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Agent History
        </div>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSelectSession(null, {
              target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
            })
          }}
          className="p-1 hover:bg-accent rounded-md transition-colors"
          title="New Session"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 px-1">
        <Input
          placeholder="Search sessions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          ref={inputRef}
        />
      </div>

      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  )
}
