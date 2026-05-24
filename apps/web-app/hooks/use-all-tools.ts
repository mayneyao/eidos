import { dynamicTool, jsonSchema, type Tool } from "ai"
import { useEffect, useMemo, useState } from "react"
import type { IExtension, ToolMeta } from "@/packages/core/types/IExtension"
import { useSqlite } from "./use-sqlite"

const builtInTools: Record<string, Tool> = {}

export const useAllTools = (): Record<string, Tool> => {
  const { sqlite } = useSqlite()
  const [toolExtensions, setToolExtensions] = useState<IExtension<ToolMeta>[]>(
    []
  )

  useEffect(() => {
    if (!sqlite) {
      return
    }
    const fetchToolExtensions = async () => {
      try {
        const extensions = await sqlite.extension.getToolExtensions("enabled")
        setToolExtensions(extensions as IExtension<ToolMeta>[])
      } catch (error) {
        console.error("Failed to fetch tool extensions:", error)
        setToolExtensions([])
      }
    }
    fetchToolExtensions()
  }, [sqlite])

  const _tools = useMemo(() => {
    const tools = toolExtensions.reduce(
      (acc, extension) => {
        if (extension.meta?.tool) {
          const meta = extension.meta.tool
          acc[meta.name] = dynamicTool({
            description: meta.description,
            inputSchema: jsonSchema(
              meta.inputJSONSchema as Record<string, unknown>
            ),
            execute: async () => ({}),
          })
        }
        return acc
      },
      {} as Record<string, Tool>
    )

    return { ...builtInTools, ...tools }
  }, [toolExtensions])

  return _tools
}
