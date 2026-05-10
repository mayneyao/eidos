import React from "react"
import { type ToolUIConfig } from "./types"

function stripHashline(line: string): string {
  // Format: `ab>12|content` → strip hash and line number prefix
  const match = line.match(/^[a-z0-9]{2}>\d+\|(.*)$/)
  return match ? match[1] : line
}

function ReadOutputView({ data }: { data: any }) {
  if (!data) return null

  if (data.error) {
    return (
      <div className="text-red-500 dark:text-red-400 text-[12px] font-mono mt-1.5">
        {data.error}
      </div>
    )
  }

  const lines = (data.content ?? "").split("\n").map(stripHashline)
  const range =
    data.from != null && data.to != null
      ? `lines ${data.from + 1}–${data.to} of ${data.totalLines}`
      : ""

  return (
    <div className="flex flex-col gap-1 mt-1.5 select-text">
      {range && (
        <div className="text-zinc-400 dark:text-zinc-500 text-[11px]">
          {range}
        </div>
      )}
      <div className="text-zinc-600 dark:text-zinc-300 bg-zinc-100/60 dark:bg-zinc-800/60 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[320px] overflow-auto whitespace-pre select-text">
        {lines.map((line: string, i: number) => (
          <div key={i} className="flex">
            <span className="text-zinc-400 dark:text-zinc-600 w-8 text-right mr-3 select-none flex-shrink-0">
              {(data.from ?? 0) + i + 1}
            </span>
            <span className="min-w-0">{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WriteOutputView({ data }: { data: any }) {
  if (!data) return null

  if (data.error) {
    return (
      <div className="text-red-500 dark:text-red-400 text-[12px] font-mono mt-1.5">
        {data.error}
      </div>
    )
  }

  return (
    <div className="text-emerald-600 dark:text-emerald-400 text-[12px] mt-1.5">
      Written successfully
    </div>
  )
}

function EditOutputView({ data }: { data: any }) {
  if (!data) return null

  if (data.error) {
    return (
      <div className="text-red-500 dark:text-red-400 text-[12px] font-mono mt-1.5">
        {data.error}
      </div>
    )
  }

  return (
    <div className="text-emerald-600 dark:text-emerald-400 text-[12px] mt-1.5">
      Edited successfully
    </div>
  )
}

export const readConfig: ToolUIConfig = {
  displayName: "Read",
  subtitle: (args) => args?.path || "",
  renderOutput: (data) => <ReadOutputView data={data} />,
}

export const writeConfig: ToolUIConfig = {
  displayName: "Write",
  subtitle: (args) => args?.path || "",
  renderOutput: (data) => <WriteOutputView data={data} />,
}

export const editConfig: ToolUIConfig = {
  displayName: "Edit",
  subtitle: (args) => args?.path || "",
  renderOutput: (data) => <EditOutputView data={data} />,
}
