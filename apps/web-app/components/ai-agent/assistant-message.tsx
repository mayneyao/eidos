import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"

import { useAgentSession } from "./agent-context"
import {
  extractReasoningText,
  ThinkingTimelineBlock,
} from "./thinking-timeline-block"
import { ToolTimelineNode, type ToolCallData } from "./tool-timeline-node"
import { type ChatMessage } from "./types"
import { convertAndMergeMessageParts, groupMessageParts } from "./message-utils"

// @streamdown/code and streamdown bundle different shiki versions; cast to bypass type mismatch
const plugins = { code: code as any }

interface AssistantMessageProps {
  message: ChatMessage
  globalResults?: Map<string, any>
  isLastMessage?: boolean
}

export function AssistantMessage({
  message,
  globalResults,
  isLastMessage,
}: AssistantMessageProps) {
  const { isRunning } = useAgentSession()
  const parts = message.parts || []

  // 1. Convert and merge tool calls/results
  const calls = convertAndMergeMessageParts(parts, globalResults)

  // 2. Group combined parts into timeline and non-timeline
  const grouped = groupMessageParts(calls)

  return (
    <div className="w-full text-sm leading-relaxed space-y-2">
      {grouped.map((part, i) => {
        if ("type" in part && part.type === "timeline") {
          return (
            <div
              key={i}
              className="relative pl-[18px] border-l border-zinc-200/40 dark:border-zinc-800/60 ml-2.5 my-1.5 space-y-3"
            >
              {part.nodes.map((node, j) => {
                const typeStr = String((node as any).type || "")
                const isReasoning =
                  typeStr === "reasoning" ||
                  typeStr === "thought" ||
                  !!(node as any).reasoning ||
                  !!(node as any).thought

                if (isReasoning) {
                  const text = extractReasoningText(
                    (node as any).reasoning ||
                      (node as any).thought ||
                      (node as any).text ||
                      ""
                  )
                  const isThinking =
                    isLastMessage &&
                    i === grouped.length - 1 &&
                    j === part.nodes.length - 1 &&
                    isRunning
                  return (
                    <ThinkingTimelineBlock
                      key={j}
                      text={text}
                      isThinking={isThinking}
                    />
                  )
                }

                return <ToolTimelineNode key={j} tool={node as ToolCallData} />
              })}
            </div>
          )
        }

        if ("type" in part && part.type === "text") {
          const text =
            typeof (part as any).text === "string"
              ? (part as any).text
              : typeof (part as any).text === "object"
                ? JSON.stringify((part as any).text)
                : String((part as any).text || "")
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
                  <ThinkingTimelineBlock
                    text={thinking}
                    isThinking={
                      isLastMessage && i === grouped.length - 1 && isRunning
                    }
                  />
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
                <Streamdown plugins={plugins}>{(part as any).text}</Streamdown>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
