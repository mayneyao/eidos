import { createAgentMiddleware, PermissionServer } from "@/packages/ai/server"
import { getCredentialsManager } from "../../sync/credentials"
import { getSpacePath } from "../../../utils/paths"
import {
  containsBinaryData,
  parseMultipartFormData,
  processBinaryDataForResponse,
  restoreBinaryData,
} from "@eidos.space/client"
import type { Hono } from "hono"
import { authorizeSpaceRequest } from "../utils/extract-space"
import type { ServerContext } from "../server"

// Singleton permission server shared across all sessions
let permissionServer: PermissionServer | null = null

function getPermissionServer(): PermissionServer {
  if (!permissionServer) {
    permissionServer = new PermissionServer()
    const port = permissionServer.getPort()
    if (port) {
      console.log(`[permission-server] started on port ${port}`)
    } else {
      // Server may not have port assigned yet; log when ready
      setTimeout(() => {
        console.log(
          `[permission-server] started on port ${permissionServer!.getPort()}`
        )
      }, 100)
    }
  }
  return permissionServer
}

/**
 * Setup API routes (RPC, AI)
 */
export function setupApiRoutes(app: Hono, ctx: ServerContext) {
  // Permission server port endpoint (for renderer to discover WS port)
  app.get("/api/permission-server-port", (c) => {
    const ps = getPermissionServer()
    return c.json({ port: ps.getPort() })
  })

  // RPC endpoint
  app.post("/rpc", async (c) => {
    try {
      const authorization = authorizeSpaceRequest(c)
      if (!authorization.allowed) {
        return c.json(
          { success: false, error: authorization.message },
          authorization.status
        )
      }
      const { spaceId } = authorization

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
      resolveRequestSpace: authorizeSpaceRequest,
      getDataspace: (space: string) =>
        space
          ? ctx.dataSpaceManager.getOrSetDataSpace(space)
          : Promise.resolve(null),
      getSpacePath: (space: string) =>
        space ? getSpacePath(space) : undefined,
      getAIConfig: () => ctx.configManager.get("ai"),
      getSecrets: async () => {
        const creds = getCredentialsManager()
        return creds.listSecrets()
      },
      logger: ctx.logger.child("AgentRoute"),
      permissionServer: getPermissionServer(),
    })
  )
}
