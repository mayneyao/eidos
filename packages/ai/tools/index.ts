import { bashTool } from "./bash"
import { webFetchTool, webSearchTool } from "./web"

export const serverTools = {
  webSearch: webSearchTool,
  webFetch: webFetchTool,
  bash: bashTool,
}

/** Names of tools that run server-side (executed by ToolLoopAgent, not the frontend) */
export const serverToolNames = [
  "webSearch",
  "webFetch",
  "bash",
  "listTables",
  "getTableSchema",
  "createTable",
  "deleteTable",
  "addField",
  "queryRecords",
  "createRecords",
  "updateRecords",
  "deleteRecords",
]
