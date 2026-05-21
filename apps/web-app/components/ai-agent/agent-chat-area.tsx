import { type RefObject } from "react"
import { GitFork } from "lucide-react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { MessageBubble } from "./message-bubble"
import { type ChatMessage } from "./types"

interface AgentChatAreaProps {
  messages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
  onFork?: (messageId: string) => void
  onEditStart?: (messageId: string, content: string) => void
  parentId?: string
  forkedMessageId?: string
  isRunning?: boolean
  error?: Error | null
}

export function AgentChatArea({
  messages,
  messagesEndRef,
  onFork,
  onEditStart,
  parentId,
  forkedMessageId,
  isRunning,
  error,
}: AgentChatAreaProps) {
  const { navigate } = useRouterAdapter()
  const results = new Map<string, any>()
  for (const m of messages) {
    if (m.role === "tool") {
      const parts = m.parts ?? []
      if (typeof parts === "string") {
        try {
          const parsedParts = JSON.parse(parts)
          if (Array.isArray(parsedParts)) {
            for (const p of parsedParts) {
              if (
                p.type === "tool-result" ||
                (p as any).type?.startsWith("tool-result")
              ) {
                const res =
                  (p as any).result ?? (p as any).output ?? (p as any).response
                if (res !== undefined) {
                  results.set((p as any).toolCallId, res)
                }
              }
            }
          }
        } catch {}
      } else if (Array.isArray(parts)) {
        for (const p of parts) {
          const typeStr = String((p as any).type || "")
          if (typeStr === "tool-result" || typeStr.startsWith("tool-result")) {
            const res =
              (p as any).result ?? (p as any).output ?? (p as any).response
            if (res !== undefined) {
              results.set((p as any).toolCallId, res)
            }
          }
        }
      }
    }
  }

  const filteredMessages = messages.filter((m) => m.role !== "tool")

  const mergedMessages: ChatMessage[] = []
  for (const m of filteredMessages) {
    const last = mergedMessages[mergedMessages.length - 1]
    if (last && last.role === "assistant" && m.role === "assistant") {
      const lastParts = Array.isArray(last.parts) ? last.parts : []
      const currentParts = Array.isArray(m.parts) ? m.parts : []
      last.parts = [...lastParts, ...currentParts]
    } else {
      mergedMessages.push({
        ...m,
        parts: Array.isArray(m.parts) ? [...m.parts] : m.parts,
      })
    }
  }

  const lastMessageId = mergedMessages[mergedMessages.length - 1]?.id

  return (
    <div className="flex flex-col w-full space-y-2 select-text">
      {mergedMessages.map((m, i) => (
        <div key={m.id || `msg-${i}`} className="flex flex-col w-full">
          <MessageBubble
            message={m}
            globalResults={results}
            isLastMessage={m.id === lastMessageId}
            isRunning={isRunning}
            onFork={onFork}
            onEditStart={onEditStart}
          />
          {parentId && forkedMessageId === m.id && (
            <div className="relative py-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <button
                onClick={() => navigate(`/agent/${parentId}`)}
                className="relative flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-primary transition-colors bg-background rounded-full border border-border hover:border-primary/30 shadow-sm"
              >
                <GitFork className="w-3 h-3" />
                <span>Forked from conversation</span>
              </button>
            </div>
          )}
        </div>
      ))}
      {error && (
        <div className="mx-2 p-3 my-2 text-[11px] text-destructive bg-destructive/5 border border-destructive/10 rounded-lg animate-in fade-in slide-in-from-bottom-1">
          <span className="font-semibold uppercase tracking-wider mr-2">
            Execution Error
          </span>
          <span className="opacity-90">
            {error.message ||
              "An unexpected error occurred during the agent's turn."}
          </span>
        </div>
      )}
      <div ref={messagesEndRef as React.LegacyRef<HTMLDivElement>} />
    </div>
  )
}
