import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react"
import { useState, type RefObject } from "react"

import { cn } from "@/lib/utils"
import { MarkdownRenderer } from "@/components/markdown-renderer/markdown-renderer"

interface ChatMessage {
  id: string
  role: string
  parts?: Array<{
    type: string
    text?: string
    reasoning?: string
    toolName?: string
    state?: string
    output?: unknown
  }>
}

interface AgentChatAreaProps {
  messages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const parts = message.parts ?? []
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true)

  // Fallback to content if no parts are available
  const contentParts =
    parts.length > 0
      ? parts
      : (message as any).content
        ? [{ type: "text", text: (message as any).content }]
        : []

  return (
    <div
      className={cn(
        "flex w-full py-2 group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[90%] min-w-0 flex flex-col",
          isUser ? "items-end" : "items-start"
        )}
      >
        {isUser ? (
          <div className="rounded-2xl bg-secondary px-4 py-2 text-sm text-foreground shadow-sm">
            <div className="break-words">
              {contentParts.map((part: any, i: number) => {
                if (part.type === "text") {
                  return <span key={i}>{part.text}</span>
                }
                return null
              })}
            </div>
          </div>
        ) : (
          <div className="w-full text-sm leading-7">
            <div className="break-words space-y-3">
              {contentParts.map((part: any, i: number) => {
                const isReasoning =
                  part.type === "reasoning" ||
                  part.type === "thought" ||
                  !!part.reasoning ||
                  !!part.thought

                if (isReasoning) {
                  const reasoningText =
                    part.reasoning || part.thought || part.text
                  if (!reasoningText) return null

                  return (
                    <div key={i} className="my-2">
                      <button
                        onClick={() =>
                          setIsReasoningExpanded(!isReasoningExpanded)
                        }
                        className="flex items-center gap-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors group/think"
                      >
                        <div className="h-px w-4 bg-muted-foreground/20 group-hover/think:bg-muted-foreground/40 transition-colors" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest">
                          Thinking
                        </span>
                        {isReasoningExpanded ? (
                          <ChevronDownIcon className="h-3 w-3" />
                        ) : (
                          <ChevronRightIcon className="h-3 w-3" />
                        )}
                      </button>
                      {isReasoningExpanded && (
                        <div className="mt-2 pl-4 border-l border-muted-foreground/10 text-xs text-muted-foreground/60 italic leading-relaxed">
                          <MarkdownRenderer className="prose-sm !text-inherit opacity-80">
                            {reasoningText}
                          </MarkdownRenderer>
                        </div>
                      )}
                    </div>
                  )
                }

                if (part.type === "text") {
                  const text = part.text || ""
                  const hasThinkTag = text.includes("<think>")

                  if (hasThinkTag) {
                    const [beforeThink, rest] = text.split("<think>")
                    const [thinking, afterThink] = rest.split("</think>")

                    return (
                      <div key={i} className="space-y-3">
                        {beforeThink && (
                          <MarkdownRenderer className="prose-zinc prose-sm">
                            {beforeThink}
                          </MarkdownRenderer>
                        )}
                        <div className="my-2">
                          <button
                            onClick={() =>
                              setIsReasoningExpanded(!isReasoningExpanded)
                            }
                            className="flex items-center gap-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors group/think"
                          >
                            <div className="h-px w-4 bg-muted-foreground/20 group-hover/think:bg-muted-foreground/40 transition-colors" />
                            <span className="text-[10px] font-semibold uppercase tracking-widest">
                              Thinking
                            </span>
                            {isReasoningExpanded ? (
                              <ChevronDownIcon className="h-3 w-3" />
                            ) : (
                              <ChevronRightIcon className="h-3 w-3" />
                            )}
                          </button>
                          {isReasoningExpanded && (
                            <div className="mt-2 pl-4 border-l border-muted-foreground/10 text-xs text-muted-foreground/60 italic leading-relaxed">
                              <MarkdownRenderer className="prose-sm !text-inherit opacity-80">
                                {thinking}
                              </MarkdownRenderer>
                            </div>
                          )}
                        </div>
                        {afterThink && (
                          <MarkdownRenderer className="prose-zinc prose-sm">
                            {afterThink}
                          </MarkdownRenderer>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={i}>
                      <MarkdownRenderer className="prose-zinc prose-sm">
                        {part.text}
                      </MarkdownRenderer>
                    </div>
                  )
                }

                if (part.type?.startsWith("tool-")) {
                  return (
                    <div
                      key={i}
                      className="my-4 rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground/80 mb-2">
                        <WrenchIcon className="h-3 w-3" />
                        <span className="font-medium tracking-tight">
                          {part.toolName}
                        </span>
                        <span className="text-[9px] uppercase bg-secondary/50 px-1 py-0.5 rounded-sm opacity-60">
                          {part.state ?? part.type.replace("tool-", "")}
                        </span>
                      </div>
                      {part.output !== undefined && (
                        <pre className="mt-2 text-[11px] opacity-70 overflow-auto max-h-48 p-2 rounded bg-secondary/30 font-mono leading-normal">
                          {typeof part.output === "string"
                            ? part.output
                            : JSON.stringify(part.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function AgentChatArea({
  messages,
  messagesEndRef,
}: AgentChatAreaProps) {
  return (
    <div className="flex flex-col w-full">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={messagesEndRef as React.LegacyRef<HTMLDivElement>} />
    </div>
  )
}
