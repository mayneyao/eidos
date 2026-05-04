import { webFetchTool, webSearchTool } from "./web"
export { createBashTool, type BashToolContext, type SpaceInfo } from "./bash"
export * from "./web"

export const serverTools = {
  webSearch: webSearchTool,
  webFetch: webFetchTool,
}

/** Names of tools that run server-side (executed by ToolLoopAgent, not the frontend) */
export const serverToolNames = [
  "webSearch",
  "webFetch",
  "bash",
  // "listTables",
  // "getTableSchema",
  // "createTable",
  // "deleteTable",
  // "addField",
  // "queryRecords",
  // "createRecords",
  // "updateRecords",
  // "deleteRecords",
]
