"use sidebar"

import {
  CheckIcon,
  PlusIcon,
  Trash2Icon,
  MessageSquareIcon,
} from "lucide-react"
import React, { useCallback, useEffect, useState } from "react"
import { useEidos } from "@eidos.space/react"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import {
  deleteSession,
  fetchSessions,
  useAgentStore,
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

/**
 * Simple cn utility for classnames
 */
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ")

export function AgentHistorySidebar() {
  const { space } = useCurrentPathInfo()
  const eidos = useEidos()
  const { sessions, setSessions, currentSessionId, setCurrentSession } =
    useAgentStore()
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="flex h-full w-full flex-col px-3 py-4 overflow-hidden">
      <div className="mb-4 px-1 flex items-center justify-between">
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

      <div className="flex-1 overflow-y-auto pr-1">
        {loading && sessions.length === 0 ? (
          <div className="px-1 py-4 text-xs text-muted-foreground animate-pulse">
            Loading history...
          </div>
        ) : sessions.length === 0 ? (
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
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => {
              const isActive = currentSessionId === s.id
              return (
                <div
                  key={s.id}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelectSession(s.id, {
                      target: e.metaKey || e.ctrlKey ? "_blank" : "_self",
                    })
                  }}
                  className={cn(
                    "group relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200",
                    isActive
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
            })}
          </div>
        )}
      </div>
    </div>
  )
}
