import { webSearchConfig } from "./web-search"
import { webFetchConfig } from "./web-fetch"
import { justBashConfig } from "./just-bash"
import { skillConfig } from "./skill"
import { readConfig, writeConfig, editConfig } from "./file-tools"
import { type ToolUIConfig } from "./types"

export { type ToolUIConfig } from "./types"

export const TOOL_UI_CONFIGS: Record<string, ToolUIConfig> = {
  "web-search": webSearchConfig,
  "web-fetch": webFetchConfig,
  bash: justBashConfig,
  skill: skillConfig,
  "file-read": readConfig,
  "file-write": writeConfig,
  "file-edit": editConfig,
}

export function getToolConfig(toolName: string): ToolUIConfig {
  const normalized = Object.keys(TOOL_UI_CONFIGS).find(
    (k) =>
      k.toLowerCase() === toolName.toLowerCase() ||
      toolName.toLowerCase().includes(k.toLowerCase())
  )
  if (normalized && TOOL_UI_CONFIGS[normalized]) {
    return TOOL_UI_CONFIGS[normalized]
  }

  const lower = toolName.toLowerCase()
  if (lower.includes("bash") || lower.includes("command")) {
    return TOOL_UI_CONFIGS.bash
  }
  if (lower.includes("search")) {
    return TOOL_UI_CONFIGS["web-search"]
  }
  if (lower.includes("fetch")) {
    return TOOL_UI_CONFIGS["web-fetch"]
  }

  // Fallback
  return {
    displayName: (args) => {
      return toolName
        .replace(/^[Tt]ool-/, "")
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    },
    subtitle: (args) => args?.query || args?.url || args?.command || "",
  }
}
