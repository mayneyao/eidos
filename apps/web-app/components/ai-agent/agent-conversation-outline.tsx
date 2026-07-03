"use client"

import { useMemo, useState } from "react"
import { FileText, SquareTerminal } from "lucide-react"

import { getToolConfig } from "./tools"
import { type ChatMessage } from "./types"
import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller"

interface AgentConversationOutlineProps {
  messages: ChatMessage[]
}

interface OutlineItem {
  id: string
  title: string
  preview: string
  labels: OutlineLabel[]
}

interface OutlineLabel {
  kind: "file" | "tool"
  text: string
}

const MIN_OUTLINE_TURNS = 4
const MAX_VISIBLE_LABELS = 2

function getMessageText(message: ChatMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : []
  const partText = parts
    .map((part: any) => {
      if (part?.type !== "text") return ""
      if (typeof part.text === "string") return part.text
      if (part.text === undefined || part.text === null) return ""
      return String(part.text)
    })
    .filter(Boolean)
    .join(" ")

  return partText || (message as any).content || ""
}

function normalizeSnippet(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getToolLabels(message: ChatMessage): OutlineLabel[] {
  const parts = Array.isArray(message.parts) ? message.parts : []

  return parts
    .map((part: any) => {
      const type = String(part?.type || "")
      const toolName =
        part?.toolName ||
        (type.startsWith("tool-") && type !== "tool-call" ? type : "")
      if (!toolName) return null

      const args = part.args || part.input || {}
      const config = getToolConfig(toolName)
      const displayName =
        typeof config.displayName === "function"
          ? config.displayName(args)
          : config.displayName
      const subtitle = config.subtitle?.(args)
      const text = normalizeSnippet(String(subtitle || displayName || ""))
      if (!text) return null

      return {
        kind:
          args?.path || String(toolName).toLowerCase().includes("file")
            ? "file"
            : "tool",
        text,
      } satisfies OutlineLabel
    })
    .filter(Boolean) as OutlineLabel[]
}

function dedupeLabels(labels: OutlineLabel[]): OutlineLabel[] {
  const seen = new Set<string>()

  return labels.filter((label) => {
    const key = `${label.kind}:${label.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildOutlineItems(messages: ChatMessage[]): OutlineItem[] {
  const items: OutlineItem[] = []

  messages.forEach((message, messageIndex) => {
    if (message.role !== "user") return

    const nextMessages: ChatMessage[] = []
    for (let i = messageIndex + 1; i < messages.length; i++) {
      if (messages[i]?.role === "user") break
      nextMessages.push(messages[i])
    }

    const assistantText = nextMessages
      .filter((nextMessage) => nextMessage.role === "assistant")
      .map(getMessageText)
      .map(normalizeSnippet)
      .find(Boolean)

    const labels = dedupeLabels(nextMessages.flatMap(getToolLabels))
    const title = normalizeSnippet(getMessageText(message))

    items.push({
      id: message.id || `msg-${messageIndex}`,
      title: title || `Turn ${items.length + 1}`,
      preview: assistantText || "",
      labels,
    })
  })

  return items
}

function getTickClass(distanceFromPreview: number | null, isActive: boolean) {
  if (distanceFromPreview === 0) return "w-8 bg-foreground"
  if (distanceFromPreview === 1) return "w-5 bg-muted-foreground/40"
  if (distanceFromPreview === 2) return "w-3 bg-muted-foreground/30"
  if (isActive) return "w-2 bg-muted-foreground/50"

  return "w-2 bg-muted-foreground/30"
}

export function AgentConversationOutline({
  messages,
}: AgentConversationOutlineProps) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const items = useMemo(() => buildOutlineItems(messages), [messages])
  const { scrollToMessage } = useMessageScroller()
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()

  if (items.length < MIN_OUTLINE_TURNS) return null

  const activeId =
    currentAnchorId ||
    items.find((item) => visibleMessageIds.includes(item.id))?.id ||
    items[0]?.id
  const previewIndex = previewId
    ? items.findIndex((item) => item.id === previewId)
    : -1

  return (
    <nav
      aria-label="Conversation"
      className="pointer-events-none absolute left-0 top-12 bottom-44 z-20 hidden md:block"
    >
      <div className="pointer-events-auto relative h-full w-16">
        <div className="absolute left-0 top-0 bottom-0 flex w-16 flex-col justify-center overflow-visible">
          {items.map((item, index) => {
            const isActive = item.id === activeId
            const isPreviewOpen = item.id === previewId
            const distanceFromPreview =
              previewIndex >= 0 ? Math.abs(index - previewIndex) : null
            const visibleLabels = item.labels.slice(0, MAX_VISIBLE_LABELS)
            const hiddenLabelCount = Math.max(
              0,
              item.labels.length - MAX_VISIBLE_LABELS
            )

            return (
              <div
                key={item.id}
                onMouseEnter={() => setPreviewId(item.id)}
                onMouseLeave={() =>
                  setPreviewId((current) =>
                    current === item.id ? null : current
                  )
                }
                onFocus={() => setPreviewId(item.id)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setPreviewId((current) =>
                      current === item.id ? null : current
                    )
                  }
                }}
                className={`relative h-3.5 w-16 shrink-0 ${
                  isPreviewOpen ? "z-10" : ""
                }`}
              >
                <button
                  type="button"
                  title={item.title}
                  aria-label={item.title}
                  aria-current={isActive ? "location" : undefined}
                  onClick={() =>
                    scrollToMessage(item.id, {
                      align: "start",
                      behavior: "smooth",
                    })
                  }
                  className="relative h-3.5 w-16 rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={`absolute left-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all duration-150 ${getTickClass(
                      distanceFromPreview,
                      isActive
                    )}`}
                  />
                  <span className="sr-only">{item.title}</span>
                </button>

                <div
                  className={`absolute left-16 top-1/2 w-[min(34rem,calc(100vw-7rem))] -translate-y-1/2 transition-[opacity,transform] duration-150 ease-out ${
                    isPreviewOpen
                      ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
                      : "pointer-events-none translate-x-1 scale-[0.98] opacity-0"
                  }`}
                >
                  <div className="rounded-lg border border-border/80 bg-popover px-3.5 py-3 text-popover-foreground shadow-md">
                    <div className="truncate text-sm font-semibold leading-5 text-foreground">
                      {item.title}
                    </div>
                    {item.preview && (
                      <div className="mt-1.5 overflow-hidden text-sm leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {item.preview}
                      </div>
                    )}
                    {visibleLabels.length > 0 && (
                      <div className="mt-2.5 flex min-w-0 items-center gap-4 text-[13px] leading-5 text-muted-foreground">
                        {visibleLabels.map((label) => {
                          const Icon =
                            label.kind === "file" ? FileText : SquareTerminal

                          return (
                            <span
                              key={`${label.kind}:${label.text}`}
                              className="inline-flex min-w-0 items-center gap-1.5"
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.7]" />
                              <span className="max-w-36 truncate">
                                {label.text}
                              </span>
                            </span>
                          )
                        })}
                        {hiddenLabelCount > 0 && (
                          <span className="shrink-0 font-medium">
                            +{hiddenLabelCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
