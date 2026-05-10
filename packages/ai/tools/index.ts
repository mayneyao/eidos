import { webFetchTool } from "./web"
export { createBashTool, type BashToolContext } from "./bash"
export { createWebSearchTool } from "./web"
export * from "./web"

export const serverTools = {
  webFetch: webFetchTool,
}
