export { createBashTool, type BashToolOptions } from "./bash/index"
export { createFileTools, type FileToolsPermissionOpts } from "./file-tools"
export { createWebSearchTools, createWebFetchTools } from "./web-tools"
export type {
  WebSearchItem,
  WebSearchResult,
  WebFetchResult,
} from "./web-tools"

export const serverTools = {} as Record<string, never>
