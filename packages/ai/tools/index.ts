export { createBashTool, type BashToolOptions } from "./bash/index"
export { createFileTools, type FileToolsPermissionOpts } from "./file-tools"
export {
  createWebSearchTools,
  createWebFetchTools,
  fetchWeb,
  searchWeb,
} from "./web-tools"
export type {
  WebFetchOptions,
  WebSearchItem,
  WebSearchOptions,
  WebSearchResult,
  WebFetchResult,
} from "./web-tools"

export const serverTools = {} as Record<string, never>
