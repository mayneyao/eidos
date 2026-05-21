import { useState } from "react"
import { CheckIcon, CopyIcon, GitForkIcon, PencilIcon } from "lucide-react"
import { AssistantMessage } from "./assistant-message"
import { type ChatMessage } from "./types"
import type { MessageMetadata } from "@/packages/core/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface MessageBubbleProps {
  message: ChatMessage
  globalResults?: Map<string, any>
  isLastMessage?: boolean
  isRunning?: boolean
  onFork?: (messageId: string) => void
  onEditStart?: (messageId: string, content: string) => void
}

// Format token count, display as k if over 1000
function formatTokens(n: number | undefined): string {
  if (n === undefined) return "?"
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`
  }
  return n.toString()
}

// User message: display full metadata
function formatUserMetadata(metadata?: MessageMetadata): string | null {
  if (!metadata) return null

  const items: string[] = []

  if (metadata.model) {
    items.push(metadata.model)
  }

  if (metadata.createdAt) {
    const date = new Date(metadata.createdAt)
    items.push(date.toLocaleTimeString())
  }

  return items.length > 0 ? items.join(" · ") : null
}

// Extract assistant message metadata
function getAssistantMeta(metadata?: MessageMetadata) {
  if (!metadata) return null

  const model = metadata.model || null

  const time = metadata.createdAt
    ? new Date(metadata.createdAt).toLocaleTimeString()
    : null

  let tokens: { compact: string; detail: string } | null = null
  if (metadata.tokens) {
    const t = metadata.tokens
    const total = t.totalTokens
    const input = t.inputTokens
    const output = t.outputTokens
    if (total !== undefined || input !== undefined || output !== undefined) {
      const totalStr = total !== undefined ? formatTokens(total) : "?"
      const inputStr = input !== undefined ? formatTokens(input) : "?"
      const outputStr = output !== undefined ? formatTokens(output) : "?"

      // Build detail line with optional cache/reasoning info
      const extras: string[] = []
      const cacheRead = t.inputTokenDetails?.cacheReadTokens
      const cacheWrite = t.inputTokenDetails?.cacheWriteTokens
      const reasoning = t.outputTokenDetails?.reasoningTokens
      if (cacheRead) extras.push(`${formatTokens(cacheRead)} cached`)
      if (cacheWrite) extras.push(`${formatTokens(cacheWrite)} cache-write`)
      if (reasoning) extras.push(`${formatTokens(reasoning)} reasoning`)

      const extraStr = extras.length > 0 ? ` · ${extras.join(" · ")}` : ""
      tokens = {
        compact: `${totalStr} tok`,
        detail: `${totalStr} tok (${inputStr} in / ${outputStr} out${extraStr})`,
      }
    }
  }

  const duration = metadata.duration
    ? `${(metadata.duration / 1000).toFixed(1)}s`
    : null

  return { model, time, tokens, duration }
}

export function MessageBubble({
  message,
  globalResults,
  isLastMessage,
  isRunning,
  onFork,
  onEditStart,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"
  const handleFork = onFork ? () => onFork(message.id) : undefined
  const userMetaText = formatUserMetadata(message.metadata)
  const assistantMeta = getAssistantMeta(message.metadata)

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

  const handleEditClick = () => {
    if (!onEditStart) return
    const content =
      (message.parts ?? [])
        .map((p: any) => p.text || "")
        .filter(Boolean)
        .join("\n") ||
      (message as any).content ||
      ""
    onEditStart(message.id, content)
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
            {userMetaText && (
              <span className="text-xs text-muted-foreground/60">
                {userMetaText}
              </span>
            )}
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
            {onEditStart && (
              <button
                onClick={handleEditClick}
                className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
                title="Edit message"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Tool result messages (role === "tool")
  if (message.role === "tool") {
    return null
  }

  const isStreaming = isLastMessage && isRunning
  const showActionsAlways = isLastMessage && !isRunning

  return (
    <div className="group/msg flex w-full py-1.5 justify-start">
      <div className="w-full min-w-0">
        <AssistantMessage
          message={message}
          globalResults={globalResults}
          isLastMessage={isLastMessage}
        />
        {!isStreaming && (
          <div
            className={`flex items-center gap-2 mt-1 transition-opacity pl-2 ${
              showActionsAlways ? "" : "opacity-0 group-hover/msg:opacity-100"
            }`}
          >
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
            {/* Assistant message: format model · 2.5k tok · 4.0s */}
            {assistantMeta?.model && (
              <span className="text-xs text-muted-foreground/60">
                {assistantMeta.model}
              </span>
            )}
            {assistantMeta?.tokens && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground/60 cursor-help">
                      {assistantMeta.tokens.compact}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{assistantMeta.tokens.detail}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {assistantMeta?.duration && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground/60 cursor-help">
                      {assistantMeta.duration}
                    </span>
                  </TooltipTrigger>
                  {assistantMeta.time && (
                    <TooltipContent side="top">
                      <p className="text-xs">{assistantMeta.time}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
