import { type ChatMessage } from "./types"

export type TimelineNode = NonNullable<ChatMessage["parts"]>[number]

export type GroupedItem =
  | { type: "timeline"; nodes: TimelineNode[] }
  | NonNullable<ChatMessage["parts"]>[number]

export function convertAndMergeMessageParts(
  parts: TimelineNode[],
  globalResults?: Map<string, any>
): TimelineNode[] {
  const results = new Map<string, any>(
    globalResults ? Array.from(globalResults.entries()) : []
  )

  // Scan across parts to pick up globalResults
  for (const part of parts) {
    const typeStr = String(part.type || "")
    if (typeStr === "tool-result" || typeStr.startsWith("tool-result")) {
      const res =
        (part as any).result ?? (part as any).output ?? (part as any).response
      if (res !== undefined && (part as any).toolCallId) {
        results.set((part as any).toolCallId, res)
      }
    }
  }

  const calls: TimelineNode[] = []
  const seenToolCallIds = new Set<string>()

  for (const part of parts) {
    const typeStr = String(part.type || "")
    const isText = typeStr === "text"
    const isReasoning =
      typeStr === "reasoning" ||
      typeStr === "thought" ||
      !!(part as any).reasoning ||
      !!(part as any).thought
    const isTool =
      typeStr === "tool-call" ||
      typeStr.startsWith("tool-") ||
      !!(part as any).toolCallId ||
      !!(part as any).toolName

    if (isText) {
      const text = (part as any).text
      if (text && typeof text === "string" && text.trim() !== "") {
        calls.push(part)
      }
    } else if (isReasoning) {
      calls.push(part)
    } else if (isTool) {
      const toolCallId = (part as any).toolCallId
      if (toolCallId) {
        if (!seenToolCallIds.has(toolCallId)) {
          seenToolCallIds.add(toolCallId)
          const merged = { ...part } as any

          // Search across all parts for result / output / args
          for (const other of parts) {
            if ((other as any).toolCallId === toolCallId) {
              merged.args =
                merged.args || (other as any).args || (other as any).input
              const directRes =
                (other as any).result ??
                (other as any).output ??
                (other as any).response
              if (directRes !== undefined) {
                merged.output = directRes
              }
              merged.toolName = merged.toolName || (other as any).toolName
            }
          }

          if (merged.output === undefined && results.has(toolCallId)) {
            merged.output = results.get(toolCallId)
          }

          calls.push(merged)
        }
      } else {
        calls.push(part)
      }
    } else {
      calls.push(part)
    }
  }

  return calls
}

export function groupMessageParts(calls: TimelineNode[]): GroupedItem[] {
  const grouped: GroupedItem[] = []
  let currentTimeline: TimelineNode[] = []

  for (const part of calls) {
    const typeStr = String(part.type || "")
    const isTool =
      typeStr === "tool-call" ||
      typeStr.startsWith("tool-") ||
      !!(part as any).toolCallId ||
      !!(part as any).toolName
    const isReasoning =
      typeStr === "reasoning" ||
      typeStr === "thought" ||
      !!(part as any).reasoning ||
      !!(part as any).thought

    if (isTool || isReasoning) {
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

  return grouped
}
