import React from "react"
import { SparklesIcon } from "lucide-react"
import { type ToolUIConfig } from "./types"

function SkillOutputView({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return (
      <div className="text-zinc-400 dark:text-zinc-500 italic text-[12px] mt-1">
        No skill data
      </div>
    )
  }

  const obj = data as Record<string, any>

  if (!obj.success) {
    return (
      <div className="text-red-500/90 text-[12px] mt-1">
        {obj.error || "Failed to load skill"}
      </div>
    )
  }

  const skill = obj.skill as
    | { name: string; description: string; path: string }
    | undefined
  const instructions = obj.instructions as string | undefined

  return (
    <div className="flex flex-col gap-2 mt-1.5">
      {skill && (
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
          <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200">
            ${skill.name}
          </span>
          {skill.description && (
            <span className="text-[11.5px] text-zinc-400 dark:text-zinc-500 truncate">
              {skill.description}
            </span>
          )}
        </div>
      )}
      {instructions && (
        <div className="text-zinc-500/90 dark:text-zinc-400/90 bg-zinc-100/40 dark:bg-zinc-800/40 p-2 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40 text-[12px] font-mono leading-relaxed max-h-[200px] overflow-auto select-text whitespace-pre-wrap">
          {instructions}
        </div>
      )}
      {obj.files && Array.isArray(obj.files) && obj.files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {obj.files.map((f: string, i: number) => (
            <span
              key={i}
              className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100/60 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 font-mono"
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const skillConfig: ToolUIConfig = {
  displayName: "Load Skill",
  subtitle: (args) => args?.skillName || "",
  renderOutput: (data) => <SkillOutputView data={data} />,
}
