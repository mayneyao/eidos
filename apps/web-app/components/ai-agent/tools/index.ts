import { webSearchConfig } from "./web-search"
import { webFetchConfig } from "./web-fetch"
import { justBashConfig } from "./just-bash"
import { type ToolUIConfig } from "./types"

export { type ToolUIConfig } from "./types"

export const TOOL_UI_CONFIGS: Record<string, ToolUIConfig> = {
  webSearch: webSearchConfig,
  webSearchTool: webSearchConfig,
  webFetch: webFetchConfig,
  webFetchTool: webFetchConfig,
  bash: justBashConfig,
  just_bash: justBashConfig,
  bashTool: justBashConfig,
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
    return TOOL_UI_CONFIGS.webSearch
  }
  if (lower.includes("fetch")) {
    return TOOL_UI_CONFIGS.webFetch
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
