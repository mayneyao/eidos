import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"

// @streamdown/code and streamdown bundle different shiki versions; cast to bypass type mismatch
const plugins = { code: code as any }

export function extractReasoningText(reasoning: any): string {
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

function ThinkingDots() {
  const [dots, setDots] = useState("")

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."))
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="inline-block min-w-[20px] tracking-widest select-none">
      {dots}
    </span>
  )
}

interface ThinkingTimelineBlockProps {
  text: any
  isThinking?: boolean
}

export function ThinkingTimelineBlock({
  text,
  isThinking,
}: ThinkingTimelineBlockProps) {
  const [expanded, setExpanded] = useState(isThinking || false)

  useEffect(() => {
    if (isThinking) {
      setExpanded(true)
    }
  }, [isThinking])

  const textStr =
    typeof text === "string"
      ? text
      : typeof text === "object"
        ? JSON.stringify(text)
        : String(text || "")

  if (!textStr) return null
  return (
    <div className="relative">
      <div
        className={`absolute -left-[22px] top-1.5 h-2 w-2 rounded-full border border-background dark:border-background flex-shrink-0 z-10 ${isThinking ? "bg-violet-500 dark:bg-violet-400 animate-pulse shadow-[0_0_12px_rgba(139,92,246,1)] scale-110" : "bg-violet-400 dark:bg-violet-500"}`}
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-[13px] font-normal transition-colors cursor-pointer select-none text-left w-fit"
        >
          {isThinking ? (
            <span className="flex items-center gap-0.5 text-violet-600 dark:text-violet-400 font-medium">
              <span>Thinking</span>
              <ThinkingDots />
            </span>
          ) : (
            <>
              <span>Thought</span>
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0" />
              )}
            </>
          )}
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
