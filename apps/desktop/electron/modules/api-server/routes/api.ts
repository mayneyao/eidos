import { createAgentMiddleware } from "@/packages/ai/server"
import {
  containsBinaryData,
  parseMultipartFormData,
  processBinaryDataForResponse,
  restoreBinaryData,
} from "@eidos.space/client"
import { Hono } from "hono"
import { extractSpaceIdFromRequest } from "../utils/extract-space"
import type { ServerContext } from "../server"

/**
 * Setup API routes (RPC, AI)
 */
export function setupApiRoutes(app: Hono, ctx: ServerContext) {
  // RPC endpoint
  app.post("/rpc", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        throw new Error("Invalid request, space ID not found in hostname")
      }

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        throw new Error(`Space not found: ${spaceId}`)
      }

      const dataSpace = await ctx.dataSpaceManager.getOrSetDataSpace(spaceId)

      let method, params, scope
      const contentType = c.req.header("content-type") || ""

      if (contentType.includes("multipart/form-data")) {
        const formData = await parseMultipartFormData(c.req.raw)
        const jsonData = JSON.parse(formData.json || "{}")

        const binaryDataMap: Record<string, any> = {}
        for (const [key, value] of Object.entries(formData)) {
          if (key.startsWith("binary_")) {
            binaryDataMap[key] = value
          }
        }

        method = jsonData.method
        params = restoreBinaryData(jsonData.params, binaryDataMap)
        scope = jsonData.scope
      } else {
        const jsonData = await c.req.json()
        method = jsonData.method
        params = jsonData.params
        scope = jsonData.scope
      }

      ctx.logger.info(`rpc[${spaceId}]`, method)
      const result = await (dataSpace as any)._executePayload({
        method,
        params,
        space: spaceId,
        dbName: spaceId,
        userId: "unknown",
      })

      if (containsBinaryData(result)) {
        const formData = new FormData()
        formData.append("json", JSON.stringify({ success: true }))

        let binaryIndex = 0
        const processedResult = processBinaryDataForResponse(
          result,
          (binaryData) => {
            const fieldName = `binary_${binaryIndex++}`
            formData.append(fieldName, binaryData)
            return fieldName
          }
        )

        formData.set(
          "json",
          JSON.stringify({ success: true, data: processedResult })
        )

        return c.newResponse(formData as any)
      } else {
        return c.json({ success: true, data: result })
      }
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400)
    }
  })

  // AI Agent routes
  app.route(
    "/",
    createAgentMiddleware({
      getDataspace: (space: string) =>
        space
          ? ctx.dataSpaceManager.getOrSetDataSpace(space)
          : Promise.resolve(null),
      getSpaceInfo: (space: string) => {
        const info = ctx.spaceRegistry.getSpace(space)
        return info ? { path: info.path } : null
      },
      getAIConfig: () => ctx.configManager.get("ai"),
    })
  )
}
