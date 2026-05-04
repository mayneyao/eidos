import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { type serverTools } from "@/packages/ai"
import { getToolConfig } from "./tools"

export interface ToolCallData {
  type?: string
  toolName?: keyof typeof serverTools
  args?: Record<string, any>
  output?: any
}

export function ToolTimelineNode({ tool }: { tool: ToolCallData }) {
  const [expanded, setExpanded] = useState(false)
  const toolName = tool.toolName || tool.type || ""
  const args = tool.args || {}

  const config = getToolConfig(toolName)
  const displayName =
    typeof config.displayName === "function"
      ? config.displayName(args)
      : config.displayName
  const subtitle = config.subtitle?.(args) || ""

  let rawData = tool.output || (tool as any).result || (tool as any).response
  if (typeof rawData === "string") {
    const trimmed = rawData.trim()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        rawData = JSON.parse(trimmed) as unknown
      } catch {}
    }
  }

  return (
    <div className="relative">
      <div className="absolute -left-[22px] top-1.5 h-2 w-2 rounded-full bg-emerald-400 dark:bg-emerald-500 border border-background dark:border-background flex-shrink-0 z-10" />

      <div className="flex flex-col">
        <button
          onClick={() => {
            if (!config.isWasmInteractive) setExpanded(!expanded)
          }}
          className={`flex items-center gap-2 text-[13px] leading-normal font-normal text-left w-fit select-none ${config.isWasmInteractive ? "cursor-default" : ""}`}
        >
          <span
            className={`text-zinc-700 dark:text-zinc-200 font-medium ${!config.isWasmInteractive ? "hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer" : ""}`}
          >
            {displayName}
          </span>
          {subtitle && (
            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[12px] truncate max-w-[550px]">
              {subtitle}
            </span>
          )}
          {!config.isWasmInteractive &&
            (expanded ? (
              <ChevronUp className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0 text-zinc-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0 text-zinc-400" />
            ))}
        </button>

        {expanded && !config.isWasmInteractive && (
          <div className="select-text">
            {rawData ? (
              config.renderOutput ? (
                config.renderOutput(rawData, args)
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
