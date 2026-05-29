import React from "react"
import { type ToolUIConfig } from "./types"

function BashOutputView({ data }: { data: any }) {
  let outputText = ""
  if (typeof data === "string") {
    outputText = data
  } else if (data && typeof data === "object") {
    if ("stdout" in data || "stderr" in data) {
      outputText = [data.stdout, data.stderr].filter(Boolean).join("\n")
    } else if ("output" in data) {
      outputText = String(data.output)
    } else if ("result" in data) {
      outputText = String(data.result)
    } else {
      outputText = JSON.stringify(data, null, 2)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 mt-1.5 select-text">
      {outputText && (
        <div className="text-zinc-600 dark:text-zinc-300 bg-zinc-100/60 dark:bg-zinc-800/60 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[320px] overflow-auto whitespace-pre-wrap select-text">
          {outputText}
        </div>
      )}
    </div>
  )
}

export const bashConfig: ToolUIConfig = {
  displayName: "Bash",
  subtitle: (args) => args?.command || "",
  renderOutput: (data) => <BashOutputView data={data} />,
}
