"use sidebar"

import { PlusIcon } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualList } from "ahooks"
import {
  useEidos,
  useExtensionContext,
  type SidebarBlockContext,
} from "@eidos.space/react"
import { SessionCard, SearchResultCard } from "./session-card"
import { SkillsList, type SkillMeta } from "./skills-list"

export interface SessionMeta {
  id: string
  goal: string
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

export interface SessionSearchResult {
  sessionId: string
  goal: string
  createdAt: string
  completedAt?: string
  snippets: Array<{ lineNumber: number; content: string }>
}

export interface SkillSearchResult {
  name: string
  dirName: string
  snippets: Array<{ content: string; line: number }>
}

async function fetchSessions(): Promise<SessionMeta[]> {
  const res = await fetch(`/api/agent/sessions`)
  if (!res.ok) return []
  return res.json()
}

async function searchSessions(query: string): Promise<SessionSearchResult[]> {
  const res = await fetch(
    `/api/agent/sessions/search?q=${encodeURIComponent(query)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  const res = await fetch(
    `/api/agent/skills/search?q=${encodeURIComponent(query)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

async function deleteSession(id: string): Promise<boolean> {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  return res.ok
}

/**
 * Extension metadata
 */
export const meta = {
  type: "sidebarBlock",
  componentName: "AgentHistorySidebar",
  icon: "message-square",
  sidebarBlock: {
    title: "AI Agent",
    description: "Session history and skills for your AI Agent.",
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
  <div className={`animate-pulse rounded-md bg-muted ${className || ""}`} />
)

const CARD_HEIGHT = 68
const SESSIONS_HISTORY_PATH = "~/.eidos/agent/sessions/history.jsonl"
const SESSIONS_DIR_PATH = "~/.eidos/agent/sessions/"
const HISTORY_REFRESH_DEBOUNCE_MS = 150

type Tab = "sessions" | "skills"

export function AgentHistorySidebar() {
  const { space, currentSessionId } = useExtensionContext<SidebarBlockContext>()
  const eidos = useEidos()
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>("sessions")

  // Search state
  const [search, setSearch] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Skills state
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillSearch, setSkillSearch] = useState("")
  const [skillSearchResults, setSkillSearchResults] = useState<
    SkillSearchResult[]
  >([])
  const [skillSearchLoading, setSkillSearchLoading] = useState(false)

  // Virtual list data source
  const items: (SessionSearchResult | (typeof sessions)[number])[] = search
    ? searchResults
    : sessions
  const virtualData = useMemo(() => items, [items])

  const [virtualList, scrollTo] = useVirtualList(virtualData, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: CARD_HEIGHT,
    overscan: 8,
  })

  // Sync selectedIndex with currentSessionId
  useEffect(() => {
    if (!currentSessionId) {
      setSelectedIndex(-1)
      return
    }
    const idx = items.findIndex(
      (item) =>
        (item as any).id === currentSessionId ||
        (item as any).sessionId === currentSessionId
    )
    setSelectedIndex(idx)
  }, [currentSessionId, items])

  // Reset selectedIndex when results or search mode change
  useEffect(() => {
    if (search) {
      setSelectedIndex(0)
    }
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
  }, [refreshSessions, currentSessionId])

  useEffect(() => {
    if (!space) return

    const abortController = new AbortController()
    const { signal } = abortController
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let active = true

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }
      refreshTimer = setTimeout(() => {
        refreshSessions()
      }, HISTORY_REFRESH_DEBOUNCE_MS)
    }

    const isHistoryEvent = (event: { filename?: string | null }) => {
      if (!event.filename) return true
      const filename = event.filename.split(/[\\/]/).pop()
      return filename === "history.jsonl"
    }

    const isAbortError = (error: unknown) =>
      error instanceof Error && error.name === "AbortError"

    const watchDirectory = async () => {
      try {
        for await (const event of eidos.currentSpace.fs.watch(
          SESSIONS_DIR_PATH,
          { signal }
        )) {
          if (isHistoryEvent(event)) {
            scheduleRefresh()
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Agent sessions history watch error:", error)
        }
      }
    }

    const watchHistory = async () => {
      try {
        for await (const event of eidos.currentSpace.fs.watch(
          SESSIONS_HISTORY_PATH,
          { signal }
        )) {
          if (isHistoryEvent(event)) {
            scheduleRefresh()
          }
        }
      } catch (error) {
        if (!active || isAbortError(error)) return
        await watchDirectory()
      }
    }

    watchHistory()

    return () => {
      active = false
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }
      abortController.abort()
    }
  }, [space, eidos.currentSpace, refreshSessions])

  // Fetch skills when switching to skills tab
  useEffect(() => {
    if (tab !== "skills" || skills.length > 0) return
    setSkillsLoading(true)
    fetch("/api/agent/skills")
      .then((r) => r.json())
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => {})
      .finally(() => setSkillsLoading(false))
  }, [tab, skills.length])

  // Debounced skill search
  useEffect(() => {
    if (!skillSearch) {
      setSkillSearchResults([])
      setSkillSearchLoading(false)
      return
    }
    let cancelled = false
    const handler = setTimeout(async () => {
      setSkillSearchLoading(true)
      try {
        const results = await searchSkills(skillSearch)
        if (!cancelled) setSkillSearchResults(results)
      } catch {
        if (!cancelled) setSkillSearchResults([])
      } finally {
        if (!cancelled) setSkillSearchLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(handler)
    }
  }, [skillSearch])

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

  // Auto-scroll selected or active item into view
  useEffect(() => {
    if (!scrollTo || items.length === 0) return

    let targetIdx = -1
    if (selectedIndex !== -1) {
      targetIdx = selectedIndex
    } else if (currentSessionId) {
      targetIdx = items.findIndex(
        (item) =>
          (item as any).id === currentSessionId ||
          (item as any).sessionId === currentSessionId
      )
    }

    if (targetIdx !== -1) {
      scrollTo(Math.max(0, targetIdx - 4)) // approximate centering
    }
  }, [selectedIndex, currentSessionId, items, scrollTo])

  const handleSelectSession = useCallback(
    (id: string | null, options?: { target?: "_blank" | "_self" }) => {
      const path = id ? `/agent/${id}` : `/agent`
      eidos.currentSpace.navigate(path, options)
    },
    [eidos.currentSpace]
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

  const handleSkillClick = useCallback(
    (skill: SkillMeta) => {
      eidos.currentSpace.navigate(`/agent/skills/${skill.dirName}`)
    },
    [eidos.currentSpace]
  )

  const handleTrySkill = useCallback(
    (e: React.MouseEvent, skill: SkillMeta) => {
      e.stopPropagation()
      eidos.currentSpace.navigate("/agent")
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("agent:try-skill", {
            detail: { dirName: skill.dirName, name: skill.name },
          })
        )
      }, 100)
    },
    [eidos.currentSpace]
  )

  const renderSessionsContent = () => {
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
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto pr-1"
        style={{ scrollbarGutter: "stable" }}
      >
        <div ref={wrapperRef} className="space-y-1">
          {virtualList.map((item) => {
            const idx = item.index
            const data = item.data
            if (search) {
              const r = data as SessionSearchResult
              return (
                <SearchResultCard
                  key={r.sessionId}
                  result={r}
                  idx={idx}
                  isActive={currentSessionId === r.sessionId}
                  isSelected={idx === selectedIndex}
                  data-active={currentSessionId === r.sessionId}
                  data-selected={idx === selectedIndex}
                  search={search}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedIndex(idx)
                    handleSelectSession(r.sessionId, {
                      target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
                    })
                  }}
                />
              )
            }
            const s = data as (typeof sessions)[number]
            return (
              <SessionCard
                key={s.id}
                session={s}
                idx={idx}
                isActive={currentSessionId === s.id}
                isSelected={idx === selectedIndex}
                data-active={currentSessionId === s.id}
                data-selected={idx === selectedIndex}
                onSelect={setSelectedIndex}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedIndex(idx)
                  handleSelectSession(s.id, {
                    target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
                  })
                }}
                onDelete={(e) => handleDeleteSession(e, s.id)}
              />
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col px-3 py-2 overflow-hidden">
      {/* Tab header */}
      <div className="mb-2 px-1 flex items-center justify-between h-8">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("sessions")}
            className={cn(
              "text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors",
              tab === "sessions"
                ? "text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            Sessions
          </button>
          <span className="text-muted-foreground/30 text-xs">/</span>
          <button
            onClick={() => setTab("skills")}
            className={cn(
              "text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors",
              tab === "skills"
                ? "text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            Skills
          </button>
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
          style={{ visibility: tab === "sessions" ? "visible" : "hidden" }}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="mb-2 px-1">
        {tab === "sessions" ? (
          <Input
            placeholder="Search sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
          />
        ) : (
          <Input
            placeholder="Search skills..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "sessions" && renderSessionsContent()}
        {tab === "skills" && (
          <SkillsList
            skills={skills}
            loading={skillsLoading}
            searchResults={skillSearchResults}
            searchLoading={skillSearchLoading}
            isSearching={!!skillSearch}
            onSkillClick={handleSkillClick}
            onTrySkill={handleTrySkill}
          />
        )}
      </div>
    </div>
  )
}
