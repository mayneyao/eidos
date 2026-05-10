import { Trash2Icon, MessageSquareIcon } from "lucide-react"
import React from "react"
import type { SessionSearchResult } from "@/components/ai-agent/agent-store"

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ")

const highlightText = (text: string, term: string) => {
  if (!term) return text
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(escaped, "gi")
  return text.replace(re, (m) => `<b>${m}</b>`)
}

interface SessionCardProps {
  session: { id: string; goal: string; status: string; createdAt: string }
  idx: number
  isActive: boolean
  isSelected: boolean
  onSelect: (idx: number) => void
  onClick: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

export function SessionCard({
  session,
  isActive,
  isSelected,
  onDelete,
  onClick,
}: SessionCardProps) {
  return (
    <div
      onClick={onClick}
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
            {session.goal || "New Conversation"}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 bg-muted/80 hover:bg-destructive/10 hover:text-destructive rounded-md transition-all shadow-sm backdrop-blur-sm shrink-0"
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-5.5 text-[10px] text-muted-foreground/60">
        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
        <span>·</span>
        <span className="capitalize">{session.status}</span>
      </div>
    </div>
  )
}

interface SearchResultCardProps {
  result: SessionSearchResult
  idx: number
  isActive: boolean
  isSelected: boolean
  search: string
  onClick: (e: React.MouseEvent) => void
}

export function SearchResultCard({
  result,
  isActive,
  isSelected,
  search,
  onClick,
}: SearchResultCardProps) {
  const goalHighlight = highlightText(result.goal || "New Conversation", search)
  const hasGoalMatch = (result.goal || "")
    .toLowerCase()
    .includes(search.toLowerCase())
  const snippet = (result.snippets ?? []).find(
    (s) => !hasGoalMatch || s.content !== result.goal
  )

  return (
    <div
      onClick={onClick}
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
        <span>{new Date(result.createdAt).toLocaleDateString()}</span>
        <span>·</span>
        <span className="capitalize">{result.status}</span>
      </div>
    </div>
  )
}
