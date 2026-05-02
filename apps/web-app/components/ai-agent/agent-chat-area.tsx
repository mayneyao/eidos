import { useState, type RefObject } from "react"

import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"

// @streamdown/code and streamdown bundle different shiki versions; cast to bypass type mismatch
const plugins = { code: code as any }

interface ChatMessage {
  id: string
  role: string
  parts?: Array<{
    type: string
    text?: string
    reasoning?: string
    toolName?: string
    toolCallId?: string
    args?: Record<string, unknown>
    state?: string
    output?: unknown
  }>
}

interface AgentChatAreaProps {
  messages: ChatMessage[]
  messagesEndRef: RefObject<HTMLDivElement | null>
}

function getToolCallTitle(tool: any): string {
  const toolName = tool.toolName || ""
  const args = tool.args || {}

  if (toolName === "list_dir") return "Listed files"
  if (toolName === "grep_search") {
    return args.Query ? `Searched for "${args.Query}"` : "Searched within files"
  }
  if (toolName === "view_file") {
    const filename = args.AbsolutePath ? args.AbsolutePath.split("/").pop() : ""
    return filename ? `Read ${filename}` : "Read file"
  }
  if (toolName === "write_to_file") {
    const filename = args.TargetFile ? args.TargetFile.split("/").pop() : ""
    return filename ? `Wrote to ${filename}` : "Wrote to file"
  }
  if (toolName === "run_command") {
    return args.CommandLine ? `Ran ${args.CommandLine}` : "Ran command"
  }

  // fallback capitalize
  const baseName = toolName
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
  return baseName || "Executed step"
}

function ThinkingTimelineBlock({ text }: { text: any }) {
  const [expanded, setExpanded] = useState(false)
  const textStr =
    typeof text === "string"
      ? text
      : typeof text === "object"
        ? JSON.stringify(text)
        : String(text || "")

  if (!textStr) return null
  return (
    <div className="relative">
      <div className="absolute -left-[28px] top-1.5 h-2 w-2 rounded-full bg-violet-400 dark:bg-violet-500 border border-background dark:border-background flex-shrink-0 z-10" />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-[13px] font-normal transition-colors cursor-pointer select-none text-left w-fit"
        >
          <span>Thought</span>
          <span className="text-[10px] font-mono leading-none opacity-80">
            {expanded ? "▲" : "▼"}
          </span>
        </button>
        {expanded && (
          <div className="mt-1 text-zinc-500/80 dark:text-zinc-400/80 text-[12px] italic leading-relaxed select-text">
            <div className="prose-sm !text-inherit opacity-80">
              <Streamdown plugins={plugins}>{textStr}</Streamdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WebSearchOutputView({ data }: { data: any }) {
  let items: any[] = []
  if (Array.isArray(data?.results)) {
    items = data.results
  } else if (Array.isArray(data)) {
    items = data
  } else if (data && typeof data === "object") {
    if (Array.isArray((data as any).output?.results)) {
      items = (data as any).output.results
    } else if (Array.isArray((data as any).output)) {
      items = (data as any).output
    } else if (Array.isArray((data as any).response?.results)) {
      items = (data as any).response.results
    } else if (Array.isArray((data as any).response)) {
      items = (data as any).response
    } else {
      for (const key in data) {
        if (Array.isArray(data[key])) {
          items = data[key]
          break
        }
      }
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-zinc-400 dark:text-zinc-500 italic text-[12px] mt-1">
        No search results found
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mt-1.5">
      {items.map((item: any, idx: number) => {
        const title = item.title || item.name || "Untitled"
        const url = item.url || item.link
        const snippet =
          item.snippet || item.snippetText || item.description || ""
        return (
          <div key={idx} className="flex flex-col gap-0.5 select-text">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 leading-snug w-fit"
              >
                {title}
              </a>
            ) : (
              <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                {title}
              </span>
            )}
            {snippet && (
              <p className="text-[11.5px] text-zinc-500/90 dark:text-zinc-400/90 line-clamp-2 leading-normal">
                {snippet}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WebFetchOutputView({ data, args }: { data: any; args: any }) {
  const title = data?.title || data?.name || ""
  const url = data?.url || args?.Url || args?.url || ""

  return (
    <div className="flex flex-col gap-1 mt-1.5 select-text">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 leading-snug w-fit"
        >
          {title || url}
        </a>
      ) : (
        <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
          {title || "No Title"}
        </span>
      )}
      {title && url && (
        <span className="text-[11.5px] text-zinc-400 dark:text-zinc-500 truncate max-w-[400px]">
          {url}
        </span>
      )}
    </div>
  )
}

function ToolTimelineNode({ tool }: { tool: any }) {
  const [expanded, setExpanded] = useState(false)
  const toolName = tool.toolName || tool.name || (tool as any).type || ""
  const args = tool.args || {}

  const rawUrl =
    args.Url ||
    args.url ||
    args.UrlToFetch ||
    args.urlToFetch ||
    args.UrlToSearch ||
    args.urlToSearch ||
    ""
  const rawQuery = args.Query || args.query || ""
  const rawPath =
    args.AbsolutePath ||
    args.absolutePath ||
    args.TargetFile ||
    args.targetFile ||
    args.CommandLine ||
    args.commandLine ||
    ""

  const subtitle = rawUrl || rawQuery || rawPath || ""

  let displayName = "Tool"
  if (toolName) {
    if (toolName.toLowerCase() === "websearch") displayName = "Web Search"
    else if (toolName.toLowerCase() === "webfetch") displayName = "Web Fetch"
    else {
      displayName = toolName
        .split("_")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    }
  }

  const isWebSearch = [
    "webSearch",
    "WebSearch",
    "search_web",
    "web-search",
    "Web Search",
  ].some(
    (name) =>
      name.toLowerCase() === toolName.toLowerCase() ||
      toolName.toLowerCase().includes(name.toLowerCase())
  )

  const isWebFetch = ["webFetch", "WebFetch", "fetch_web", "fetch-web"].some(
    (name) =>
      name.toLowerCase() === toolName.toLowerCase() ||
      toolName.toLowerCase().includes(name.toLowerCase())
  )

  let rawData = tool.output || tool.result || tool.response
  if (typeof rawData === "string") {
    const trimmed = rawData.trim()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        rawData = JSON.parse(trimmed)
      } catch {}
    }
  }

  return (
    <div className="relative">
      <div className="absolute -left-[28px] top-1.5 h-2 w-2 rounded-full bg-emerald-400 dark:bg-emerald-500 border border-background dark:border-background flex-shrink-0 z-10" />

      <div className="flex flex-col">
        <button
          onClick={() => {
            if (!isWebFetch) setExpanded(!expanded)
          }}
          className={`flex items-center gap-2 text-[13px] leading-normal font-normal text-left w-fit select-none ${isWebFetch ? "cursor-default" : ""}`}
        >
          <span
            className={`text-zinc-700 dark:text-zinc-200 font-medium ${!isWebFetch ? "hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer" : ""}`}
          >
            {displayName}
          </span>
          {subtitle && (
            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[12px] truncate max-w-[280px]">
              {subtitle}
            </span>
          )}
          {!isWebFetch && (
            <span className="text-[10px] font-mono leading-none opacity-80 text-zinc-400">
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </button>

        {expanded && !isWebFetch && (
          <div className="select-text">
            {rawData ? (
              isWebSearch ? (
                <WebSearchOutputView data={rawData} />
              ) : isWebFetch ? (
                <WebFetchOutputView data={rawData} args={args} />
              ) : typeof rawData === "string" ? (
                <div className="mt-1 text-zinc-500/90 dark:text-zinc-400/90 bg-zinc-100/40 dark:bg-zinc-800/40 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[160px] overflow-auto select-text">
                  {rawData}
                </div>
              ) : (
                <div className="mt-1 text-zinc-500/90 dark:text-zinc-400/90 bg-zinc-100/40 dark:bg-zinc-800/40 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[160px] overflow-auto select-text">
                  {JSON.stringify(rawData, null, 2)}
                </div>
              )
            ) : (
              <div className="mt-1 text-zinc-400 italic text-[12px]">
                Executing...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function extractReasoningText(reasoning: any): string {
  if (!reasoning) return ""
  if (typeof reasoning === "string") return reasoning
  if (Array.isArray(reasoning)) {
    return reasoning
      .map((r: any) => {
        if (typeof r === "string") return r
        if (r && typeof r === "object")
          return r.text || r.reasoning || r.thought || JSON.stringify(r)
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  if (typeof reasoning === "object") {
    return (
      reasoning.text ||
      reasoning.reasoning ||
      reasoning.thought ||
      JSON.stringify(reasoning)
    )
  }
  return String(reasoning)
}

function AssistantMessage({
  message,
  globalResults,
}: {
  message: ChatMessage
  globalResults?: Map<string, any>
}) {
  let parts: any[] = []
  if (Array.isArray(message.parts)) {
    parts = [...message.parts]
  } else if (typeof message.parts === "string") {
    try {
      const parsedParts = JSON.parse(message.parts)
      if (Array.isArray(parsedParts)) {
        parts = [...parsedParts]
      }
    } catch {
      // ignore
    }
  }

  const content = (message as any).content
  if (typeof content === "string") {
    if (content.startsWith("[") || content.startsWith("{")) {
      try {
        const parsedContent = JSON.parse(content)
        if (Array.isArray(parsedContent)) {
          parts = [...parts, ...parsedContent]
        } else if (parsedContent && typeof parsedContent === "object") {
          parts = [...parts, parsedContent]
        }
      } catch {
        parts.push({ type: "text", text: content })
      }
    } else if (content) {
      parts.push({ type: "text", text: content })
    }
  }

  const contentParts = parts.length > 0 ? parts : []

  const calls: any[] = []
  const results = new Map<string, any>(
    globalResults ? Array.from(globalResults.entries()) : []
  )

  for (const part of contentParts) {
    if (
      part.type === "tool-result" ||
      (part as any).type?.startsWith("tool-result")
    ) {
      const res =
        (part as any).result ?? (part as any).output ?? (part as any).response
      if (res !== undefined) {
        results.set((part as any).toolCallId, res)
      }
    } else {
      calls.push(part)
    }
  }

  const validCalls = calls.filter((part) => {
    if (part.type === "text" && (!part.text || part.text.trim() === "")) {
      return false
    }
    return true
  })

  const grouped: any[] = []
  let currentTimeline: any[] = []

  for (const part of validCalls) {
    const isTool =
      part.type === "tool-call" ||
      part.type?.startsWith("tool-") ||
      !!(part as any).toolName
    const isReasoning =
      part.type === "reasoning" ||
      part.type === "thought" ||
      !!(part as any).reasoning ||
      !!(part as any).thought

    if (isTool || isReasoning) {
      if (isTool && (part as any).toolCallId) {
        const directRes =
          (part as any).result ?? (part as any).output ?? (part as any).response
        if (directRes !== undefined) {
          part.output = directRes
        } else if (results.has((part as any).toolCallId)) {
          part.output = results.get((part as any).toolCallId)
        }
      }
      currentTimeline.push(part)
    } else {
      if (currentTimeline.length > 0) {
        grouped.push({ type: "timeline", nodes: currentTimeline })
        currentTimeline = []
      }
      grouped.push(part)
    }
  }

  if (currentTimeline.length > 0) {
    grouped.push({ type: "timeline", nodes: currentTimeline })
  }

  return (
    <div className="w-full text-sm leading-relaxed space-y-2">
      {grouped.map((part: any, i: number) => {
        if (part.type === "timeline") {
          return (
            <div
              key={i}
              className="relative pl-6 border-l border-zinc-200/40 dark:border-zinc-800/60 ml-2.5 my-1.5 space-y-3"
            >
              {part.nodes.map((node: any, j: number) => {
                const isReasoning =
                  node.type === "reasoning" ||
                  node.type === "thought" ||
                  !!(node as any).reasoning ||
                  !!(node as any).thought

                if (isReasoning) {
                  const text = extractReasoningText(
                    node.reasoning || node.thought || node.text || ""
                  )
                  return <ThinkingTimelineBlock key={j} text={text} />
                }

                return <ToolTimelineNode key={j} tool={node} />
              })}
            </div>
          )
        }

        if (part.type === "text") {
          const text =
            typeof part.text === "string"
              ? part.text
              : typeof part.text === "object"
                ? JSON.stringify(part.text)
                : String(part.text || "")
          const hasThinkTag = text.includes("<think>")

          if (hasThinkTag) {
            const [beforeThink, rest] = text.split("<think>")
            const [thinking, afterThink] = rest.split("</think>")
            return (
              <div key={i} className="space-y-2">
                {beforeThink && (
                  <div className="prose-zinc prose-sm dark:prose-invert">
                    <Streamdown plugins={plugins}>{beforeThink}</Streamdown>
                  </div>
                )}
                <div className="relative pl-6 border-l border-zinc-200/40 dark:border-zinc-800/60 ml-2.5 my-2.5">
                  <ThinkingTimelineBlock text={thinking} />
                </div>
                {afterThink && (
                  <div className="prose-zinc prose-sm dark:prose-invert">
                    <Streamdown plugins={plugins}>{afterThink}</Streamdown>
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={i}>
              <div className="prose-zinc prose-sm dark:prose-invert">
                <Streamdown plugins={plugins}>{part.text}</Streamdown>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

function MessageBubble({
  message,
  globalResults,
}: {
  message: ChatMessage
  globalResults?: Map<string, any>
}) {
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
        <AssistantMessage message={message} globalResults={globalResults} />
      </div>
    </div>
  )
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

  return (
    <div className="flex flex-col w-full space-y-2 select-text">
      {mergedMessages.map((m) => (
        <MessageBubble key={m.id} message={m} globalResults={results} />
      ))}
      <div ref={messagesEndRef as React.LegacyRef<HTMLDivElement>} />
    </div>
  )
}
