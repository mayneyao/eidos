import { useState } from "react"
import { CheckIcon, CopyIcon, GitForkIcon } from "lucide-react"
import { AssistantMessage } from "./assistant-message"
import { type ChatMessage } from "./types"

interface MessageBubbleProps {
  message: ChatMessage
  globalResults?: Map<string, any>
  isLastMessage?: boolean
  onFork?: (messageId: string) => void
}

export function MessageBubble({
  message,
  globalResults,
  isLastMessage,
  onFork,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"
  const handleFork = onFork ? () => onFork(message.id) : undefined

  const handleCopy = () => {
    const text =
      (message.parts ?? [])
        .map((p: any) => p.text || "")
        .filter(Boolean)
        .join("\n") ||
      (message as any).content ||
      ""

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    return (
      <div className="group/msg flex w-full py-1.5 justify-end">
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className="rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/80 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/30 dark:border-zinc-700/30">
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
          <div className="flex items-center gap-2 opacity-0 group-hover/msg:opacity-100 transition-opacity pr-2">
            <button
              onClick={handleCopy}
              className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
              title="Copy message"
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </button>
            {handleFork && (
              <button
                onClick={handleFork}
                className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
                title="Fork session here"
              >
                <GitForkIcon className="h-4 w-4" />
              </button>
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
    <div className="group/msg flex w-full py-1.5 justify-start">
      <div className="w-full min-w-0">
        <AssistantMessage
          message={message}
          globalResults={globalResults}
          isLastMessage={isLastMessage}
        />
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity pl-2">
          <button
            onClick={handleCopy}
            className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
            title="Copy message"
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-green-500" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
          </button>
          {handleFork && (
            <button
              onClick={handleFork}
              className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
              title="Fork session here"
            >
              <GitForkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
