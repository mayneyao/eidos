import type { Tool } from "ai"
import { useEffect, useMemo, useState } from "react"
import type { IExtension, ToolMeta } from "@/packages/core/types/IExtension"
import { useSqlite } from "./use-sqlite"
// import { createRecordsTool } from "./tools/table"

const builtInTools = {
  // createRecords: createRecordsTool,
}

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
        // Use the extension table's getToolExtensions method to get enabled tool extensions
        const extensions = await sqlite.extension.getToolExtensions("enabled")
        setToolExtensions(extensions as IExtension<ToolMeta>[])
      } catch (error) {
        console.error("Failed to fetch tool extensions:", error)
        setToolExtensions([])
      }
    }
    fetchToolExtensions()
  }, [sqlite])

  // Transform tool extensions into AI Tool format
  const _tools = useMemo(() => {
    const tools = toolExtensions.reduce(
      (acc, extension) => {
        if (extension.meta?.tool) {
          const tool = extension.meta.tool
          acc[tool.name] = {
            description: tool.description,
            parameters: tool.inputJSONSchema,
            id: `${extension.id}.${extension.meta.funcName}` as `${string}.${string}`,
          }
        }
        return acc
      },
      {} as Record<string, Tool>
    )

    // Merge with built-in tools
    return { ...builtInTools, ...tools }
  }, [toolExtensions])

  return _tools
}
