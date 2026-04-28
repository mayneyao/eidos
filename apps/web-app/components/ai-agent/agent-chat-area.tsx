import type { UIMessage } from "ai"
import { BotIcon, UserIcon, WrenchIcon } from "lucide-react"
import type { RefObject } from "react"

import { cn } from "@/lib/utils"

interface AgentChatAreaProps {
  messages: UIMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
}

function MessageContent({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"

  const parts = (message as any).parts ?? []

  return (
    <div
      className={cn(
        "flex gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-primary-foreground" />
          </div>
        ) : (
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
            <BotIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div
        className={cn(
          "flex-1 min-w-0 rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {parts.map((part: any, i: number) => {
            if (part && "text" in part) {
              return <span key={i}>{part.text}</span>
            }
            if (part && "toolName" in part) {
              return (
                <div
                  key={i}
                  className="my-2 rounded border bg-background p-2 text-xs"
                >
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <WrenchIcon className="h-3 w-3" />
                    <span className="font-medium">{part.toolName}</span>
                    <span>({part.state})</span>
                  </div>
                  {part.output !== undefined && (
                    <pre className="mt-1 text-xs opacity-80 overflow-auto max-h-32">
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
    </div>
  )
}

export function AgentChatArea({
  messages,
  messagesEndRef,
}: AgentChatAreaProps) {
  return (
    <div className="flex flex-col">
      {messages.map((message) => (
        <MessageContent key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef as React.LegacyRef<HTMLDivElement>} />
    </div>
  )
}
