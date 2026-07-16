import { useMemo } from "react"
import {
  AlertCircle,
  Bot,
  LoaderCircle,
  MessageSquareText,
  Plus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useFileSpaceAgentSessionActivities } from "@/apps/web-app/components/file-space-agent/session-activity"
import { useTabStore } from "@/apps/web-app/store/tabs"

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
      return "Needs approval"
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

      {agentTabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center px-4 py-8">
          <Bot className="mb-3 h-5 w-5 text-sidebar-foreground/45" />
          <p className="text-xs font-medium text-sidebar-foreground">
            No open Agent sessions
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
          {agentTabs.map(({ tab, conversationId }) => {
            const activity = activities[conversationId]
            const active = tab.id === activeTabId
            const working =
              activity?.status === "queued" || activity?.status === "running"
            const needsAttention =
              activity?.status === "waiting-approval" ||
              activity?.status === "failed"
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "group/session flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left outline-hidden",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
                  "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
                )}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectConversation(tab.id)}
              >
                {working ? (
                  <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
                ) : needsAttention ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {tab.title || "Agent"}
                  </span>
                  <span className="block truncate text-[10px] text-sidebar-foreground/50">
                    {statusLabel(activity?.status)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
