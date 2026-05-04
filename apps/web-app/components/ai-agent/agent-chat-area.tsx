import { type RefObject } from "react"
import { MessageBubble } from "./message-bubble"
import { type ChatMessage } from "./types"

interface AgentChatAreaProps {
  messages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
}

export function AgentChatArea({
  messages,
  messagesEndRef,
}: AgentChatAreaProps) {
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
      {mergedMessages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          globalResults={results}
          isLastMessage={m.id === lastMessageId}
        />
      ))}
      <div ref={messagesEndRef as React.LegacyRef<HTMLDivElement>} />
    </div>
  )
}
