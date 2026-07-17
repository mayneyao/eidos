import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Bot,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Search,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useFileSpaceAgentSessionActivities } from "@/apps/web-app/components/file-space-agent/session-activity"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import type { FileSpaceAgentConversation } from "@/apps/desktop/electron/modules/file-space-agent/types"

import { fileSpaceAgentConversationId } from "./work-modes"

export interface AgentModePanelProps {
  busy?: boolean
  onNewConversation: () => void
  onSelectConversation: (tabId: string) => void
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case "queued":
      return "Queued"
    case "running":
      return "Running"
    case "waiting-approval":
      return "Approval required"
    case "failed":
      return "Needs attention"
    default:
      return "Ready"
  }
}

export function AgentModePanel({
  busy = false,
  onNewConversation,
  onSelectConversation,
}: AgentModePanelProps) {
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.getActiveTabId())
  const { currentSpace } = useCurrentSpace()
  const [conversations, setConversations] = useState<
    FileSpaceAgentConversation[]
  >([])
  const [query, setQuery] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const activities = useFileSpaceAgentSessionActivities()
  const agentTabs = useMemo(
    () =>
      tabs
        .flatMap((tab) => {
          const conversationId = fileSpaceAgentConversationId(tab.url)
          return conversationId ? [{ tab, conversationId }] : []
        })
        .sort((a, b) => b.tab.lastAccessTime - a.tab.lastAccessTime),
    [tabs]
  )
  useEffect(() => {
    if (!currentSpace?.id || !window.eidos?.fileSpaceAgent) {
      setConversations([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      try {
        const next = query.trim()
          ? await window.eidos.fileSpaceAgent.searchConversations(
              currentSpace.id,
              query
            )
          : await window.eidos.fileSpaceAgent.listConversations(currentSpace.id)
        if (!cancelled) setConversations(next)
      } catch {
        if (!cancelled) setConversations([])
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 2_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [currentSpace?.id, query])
  const sessions = useMemo(() => {
    const openByConversation = new Map(
      agentTabs.map((entry) => [entry.conversationId, entry.tab])
    )
    const rows = conversations.map((conversation) => ({
      conversationId: conversation.id,
      title: conversation.title,
      updatedAt: new Date(conversation.updatedAt).getTime(),
      latestRunStatus: conversation.latestRunStatus,
      pendingApprovalCount: conversation.pendingApprovalCount,
      pendingApprovalTitle: conversation.pendingApprovalTitle,
      tab: openByConversation.get(conversation.id),
    }))
    const known = new Set(rows.map((row) => row.conversationId))
    for (const entry of agentTabs) {
      if (query.trim() || known.has(entry.conversationId)) continue
      rows.push({
        conversationId: entry.conversationId,
        title: entry.tab.title || "Agent",
        updatedAt: entry.tab.lastAccessTime,
        latestRunStatus: undefined,
        pendingApprovalCount: undefined,
        pendingApprovalTitle: undefined,
        tab: entry.tab,
      })
    }
    return rows.sort((left, right) => right.updatedAt - left.updatedAt)
  }, [agentTabs, conversations, query])

  const deleteConversation = async (
    conversationId: string,
    title: string,
    tabId?: string
  ) => {
    if (
      !currentSpace?.id ||
      !window.confirm(
        `Delete “${title || "Agent conversation"}”? This removes its local conversation data.`
      )
    ) {
      return
    }
    setActionError(null)
    try {
      await window.eidos.fileSpaceAgent.deleteConversation(
        currentSpace.id,
        conversationId
      )
      if (tabId) useTabStore.getState().closeTab(tabId)
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId)
      )
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="eidos-shell-workbar flex shrink-0 items-center gap-1 border-b border-sidebar-border/60 px-1.5">
        <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/70">
          Sessions
        </span>
        <button
          type="button"
          className="flex h-6 items-center gap-1 rounded-[3px] px-1.5 text-[10px] font-medium text-sidebar-foreground/65 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-50"
          aria-label="New Agent conversation"
          title="New Agent conversation"
          disabled={busy}
          onClick={onNewConversation}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New</span>
        </button>
      </div>

      <div className="relative shrink-0 border-b border-sidebar-border/60 p-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-sidebar-foreground/40" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search Agent conversations"
          className="h-7 w-full rounded-[3px] border border-sidebar-border bg-sidebar pl-6 pr-2 text-[11px] text-sidebar-foreground outline-hidden placeholder:text-sidebar-foreground/40 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        />
      </div>

      {actionError ? (
        <div className="border-b border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[10px] leading-4 text-destructive">
          {actionError}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center px-4 py-8">
          <Bot className="mb-3 h-5 w-5 text-sidebar-foreground/45" />
          <p className="text-xs font-medium text-sidebar-foreground">
            {query ? "No matching conversations" : "No Agent conversations"}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-sidebar-foreground/55">
            Start a conversation without replacing your current file tab.
          </p>
          <button
            type="button"
            className="mt-3 flex h-7 items-center gap-1.5 rounded-[3px] border border-sidebar-border bg-sidebar px-2 text-xs font-medium text-sidebar-foreground outline-hidden hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-50"
            disabled={busy}
            onClick={onNewConversation}
          >
            <Plus className="h-3.5 w-3.5" />
            New conversation
          </button>
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
          aria-label="Open Agent sessions"
        >
          {sessions.map(
            ({
              tab,
              conversationId,
              title,
              latestRunStatus,
              pendingApprovalCount,
              pendingApprovalTitle,
            }) => {
              const activity = activities[conversationId]
              const status = activity?.status ?? latestRunStatus
              const active = tab?.id === activeTabId
              const working = status === "queued" || status === "running"
              const needsAttention =
                status === "waiting-approval" || status === "failed"
              return (
                <div
                  key={conversationId}
                  className={cn(
                    "group/session flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left outline-hidden",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
                    status === "waiting-approval" &&
                      "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
                    status === "failed" &&
                      "bg-destructive/5 text-destructive hover:bg-destructive/10",
                    "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left outline-hidden"
                    aria-current={active ? "page" : undefined}
                    aria-label={`${title || "Agent"}: ${statusLabel(status)}`}
                    onClick={() => {
                      if (tab) {
                        onSelectConversation(tab.id)
                        return
                      }
                      useTabStore
                        .getState()
                        .openTab(`/agent/${conversationId}`, title || "Agent", {
                          forceNewTab: true,
                          state: { __isInternalTabNavigation: true },
                        })
                    }}
                  >
                    {working ? (
                      <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500 motion-reduce:animate-none" />
                    ) : needsAttention ? (
                      <AlertCircle
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          status === "waiting-approval"
                            ? "text-amber-500"
                            : "text-destructive"
                        )}
                      />
                    ) : (
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {title || "Agent"}
                      </span>
                      <span className="block truncate text-[10px] text-sidebar-foreground/50">
                        {status === "waiting-approval" && pendingApprovalTitle
                          ? `Approve: ${pendingApprovalTitle}`
                          : statusLabel(status)}
                      </span>
                    </span>
                  </button>
                  {status === "waiting-approval" ? (
                    <span
                      className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                      title={`${pendingApprovalCount ?? 1} approval request${(pendingApprovalCount ?? 1) === 1 ? "" : "s"}`}
                    >
                      Review
                    </span>
                  ) : working ? (
                    <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:text-blue-300">
                      Running
                    </span>
                  ) : status === "failed" ? (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive">
                      Failed
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-[3px] p-1 text-sidebar-foreground/35 opacity-0 outline-hidden hover:bg-sidebar hover:text-destructive focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-sidebar-ring group-hover/session:opacity-100"
                    aria-label={`Delete ${title || "Agent conversation"}`}
                    title="Delete conversation"
                    onClick={() =>
                      void deleteConversation(conversationId, title, tab?.id)
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            }
          )}
        </div>
      )}
    </div>
  )
}
