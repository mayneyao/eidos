import { useState } from "react"
import { Check, ChevronDown, ChevronRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type serverTools } from "@/packages/ai"
import { getToolConfig } from "./tools"

type ToolAuditStatus =
  | "running"
  | "waiting-approval"
  | "approved"
  | "succeeded"
  | "failed"
  | "denied"
  | "canceled"
  | "interrupted"
  | "outcome-unknown"

interface ToolAuditPresentation {
  title: string
  risk: "observe" | "external" | "modify"
  approvalMode?: "ask" | "auto-safe" | "full-access"
  approval?: "required" | "automatic"
  status: ToolAuditStatus
  resource?: string
  inputSummary: string
  preview?: string
  resultSummary?: string
  error?: string
}

export interface ToolCallData {
  type?: string
  toolName?: keyof typeof serverTools
  args?: Record<string, any>
  output?: any
  audit?: ToolAuditPresentation
  onAuditDecision?: (decision: "allow-once" | "deny") => void
}

function auditTone(status: ToolAuditStatus): {
  dot: string
  label: string
} {
  if (status === "failed" || status === "denied") {
    return { dot: "bg-destructive", label: "text-destructive" }
  }
  if (status === "waiting-approval" || status === "outcome-unknown") {
    return {
      dot: "bg-amber-400 dark:bg-amber-500",
      label: "text-amber-700 dark:text-amber-300",
    }
  }
  if (status === "running" || status === "approved") {
    return { dot: "bg-sky-400 dark:bg-sky-500", label: "text-sky-600" }
  }
  if (status === "canceled" || status === "interrupted") {
    return { dot: "bg-zinc-400", label: "text-zinc-500" }
  }
  return {
    dot: "bg-emerald-400 dark:bg-emerald-500",
    label: "text-emerald-600 dark:text-emerald-400",
  }
}

export function ToolTimelineNode({ tool }: { tool: ToolCallData }) {
  const [expanded, setExpanded] = useState(false)

  const toolName = tool.toolName || tool.type || ""
  const args = tool.args || {}
  const audit = tool.audit
  const tone = audit ? auditTone(audit.status) : null

  const config = getToolConfig(toolName)
  const displayName =
    audit?.title ??
    (typeof config.displayName === "function"
      ? config.displayName(args)
      : config.displayName)
  const subtitle = audit?.resource ?? config.subtitle?.(args) ?? ""

  let rawData =
    tool.output ?? (tool as any).result ?? (tool as any).response ?? undefined
  if (typeof rawData === "string") {
    const trimmed = rawData.trim()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        rawData = JSON.parse(trimmed) as unknown
      } catch {}
    }
  }
  const canExpand = !!audit || !config.isWasmInteractive
  const showDetails = expanded || audit?.status === "waiting-approval"

  return (
    <div className="relative">
      <div
        className={`absolute -left-[22px] top-1.5 z-10 h-2 w-2 flex-shrink-0 rounded-full border border-background ${tone?.dot ?? "bg-emerald-400 dark:bg-emerald-500"}`}
      />

      <div className="flex flex-col">
        <button
          onClick={() => {
            if (canExpand) setExpanded(!expanded)
          }}
          className={`flex w-full select-none items-center gap-2 text-left text-[13px] font-normal leading-normal ${canExpand ? "" : "cursor-default"}`}
        >
          <span
            className={`flex-shrink-0 font-medium text-zinc-700 dark:text-zinc-200 ${canExpand ? "cursor-pointer transition-colors hover:text-zinc-900 dark:hover:text-white" : ""}`}
          >
            {displayName}
          </span>
          {subtitle && (
            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[12px] truncate min-w-0">
              {subtitle}
            </span>
          )}
          {audit ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {audit.approval === "automatic" ? (
                <span
                  className={
                    audit.approvalMode === "full-access"
                      ? "text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400"
                      : "text-[10px] uppercase tracking-wide text-muted-foreground"
                  }
                  title={`Automatically approved by ${audit.approvalMode ?? "the selected mode"}`}
                >
                  auto
                </span>
              ) : null}
              <span
                className={`text-[10px] uppercase tracking-wide ${tone?.label}`}
              >
                {audit.status.replace("-", " ")}
              </span>
            </span>
          ) : null}
          {canExpand &&
            (expanded ? (
              <ChevronDown className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0 text-zinc-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 stroke-[1.5] opacity-80 flex-shrink-0 text-zinc-400" />
            ))}
        </button>

        {showDetails && canExpand ? (
          <div className="mt-1 select-text space-y-2 rounded-lg border border-zinc-200/40 bg-zinc-100/40 p-2 text-[12px] leading-relaxed text-zinc-600 dark:border-zinc-800/40 dark:bg-zinc-800/40 dark:text-zinc-300">
            {audit ? (
              <>
                <div className="whitespace-pre-wrap text-zinc-500 dark:text-zinc-400">
                  {audit.inputSummary}
                </div>
                {audit.approval === "automatic" ? (
                  <div
                    className={
                      audit.approvalMode === "full-access"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-muted-foreground"
                    }
                  >
                    Automatically approved by {audit.approvalMode ?? "policy"}.
                  </div>
                ) : null}
                {audit.preview ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-5 text-foreground">
                    {audit.preview}
                  </pre>
                ) : null}
                {audit.resultSummary ? (
                  <div className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                    {audit.resultSummary}
                  </div>
                ) : null}
                {audit.error ? (
                  <div className="text-destructive">{audit.error}</div>
                ) : null}
                {audit.status === "waiting-approval" && tool.onAuditDecision ? (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => tool.onAuditDecision?.("deny")}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={() => tool.onAuditDecision?.("allow-once")}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Allow once
                    </Button>
                  </div>
                ) : null}
              </>
            ) : rawData !== undefined ? (
              config.renderOutput ? (
                config.renderOutput(rawData, args)
              ) : typeof rawData === "string" ? (
                <div className="max-h-[160px] overflow-auto font-mono">
                  {rawData}
                </div>
              ) : (
                <div className="max-h-[160px] overflow-auto font-mono">
                  {JSON.stringify(rawData, null, 2)}
                </div>
              )
            ) : (
              <div className="mt-1 text-zinc-400 italic text-[12px]">
                Executing...
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
