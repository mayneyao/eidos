import { AssistantMessage } from "./assistant-message"
import { type ChatMessage } from "./types"

interface MessageBubbleProps {
  message: ChatMessage
  globalResults?: Map<string, any>
  isLastMessage?: boolean
}

export function MessageBubble({
  message,
  globalResults,
  isLastMessage,
}: MessageBubbleProps) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex w-full py-1.5 justify-end">
        <div className="max-w-[80%] rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/80 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/30 dark:border-zinc-700/30">
          <div className="break-words">
            {(message.parts ?? []).map((part: any, i: number) =>
              part.type === "text" ? <span key={i}>{part.text}</span> : null
            )}
            {(!message.parts || message.parts.length === 0) &&
              (message as any).content && (
                <span>{(message as any).content}</span>
              )}
          </div>
        </div>
      </div>
    )
  }

  // Tool result messages (role === "tool")
  if (message.role === "tool") {
    return null // tool results are shown inline with tool calls
  }

  return (
    <div className="flex w-full py-1.5 justify-start">
      <div className="w-full min-w-0">
        <AssistantMessage
          message={message}
          globalResults={globalResults}
          isLastMessage={isLastMessage}
        />
      </div>
    </div>
  )
}
