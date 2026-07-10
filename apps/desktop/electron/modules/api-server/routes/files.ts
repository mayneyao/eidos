import path from "path"
import type { Hono } from "hono"
import { getSpaceFileFromPath } from "@/apps/desktop/electron/utils/paths"
import { serveFile } from "../serve-file"
import { authorizeSpaceRequest } from "../utils/extract-space"
import {
  getSpaceProjectFileErrorResponse,
  resolveSpaceProjectFilePath,
} from "./space-project-file"
import type { ServerContext } from "../server"

/**
 * Setup file serving routes
 */
export function setupFileRoutes(app: Hono, ctx: ServerContext) {
  // Files from space storage
  app.get("/files/*", async (c) => {
    try {
      const authorization = authorizeSpaceRequest(c)
      if (!authorization.allowed) {
        return c.text(authorization.message, authorization.status)
      }
      const { spaceId } = authorization

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        return c.text(`Space not found: ${spaceId}`, 404)
      }

      const fullPath = c.req.path
      const filePath = fullPath.replace("/files/", "")

      const file = getSpaceFileFromPath(spaceId, filePath)
      const headers = new Headers()
      headers.append("Content-Type", file.type)
      headers.append("Cross-Origin-Embedder-Policy", "require-corp")
      headers.append("Cross-Origin-Resource-Policy", "cross-origin")
      headers.append("Accept-Ranges", "bytes")

      const rangeHeader = c.req.header("range")
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1])
          const end = match[2] ? parseInt(match[2]) : file.size - 1
          const chunk = file.slice(start, end + 1)

          headers.append("Content-Range", `bytes ${start}-${end}/${file.size}`)
          headers.append("Content-Length", String(chunk.size))
          return c.newResponse(chunk as any, {
            status: 206,
            headers,
          })
        }
      }

      return c.newResponse(file as any, { headers })
    } catch (error: any) {
      return c.text(`Error serving file: ${error.message}`, 500)
    }
  })

  // Project files
  app.get("/~/*", async (c) => {
    try {
      const authorization = authorizeSpaceRequest(c)
      if (!authorization.allowed) {
        return c.text(authorization.message, authorization.status)
      }
      const { spaceId } = authorization

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        return c.text(`Space not found: ${spaceId}`, 404)
      }

      const requestPath = c.req.path.startsWith("/~/")
        ? c.req.path.slice(3)
        : ""
      const fullPath = await resolveSpaceProjectFilePath(
        space.path,
        requestPath
      )

      return serveFile(fullPath, c)
    } catch (error: unknown) {
      const response = getSpaceProjectFileErrorResponse(error)
      return c.text(response.message, response.status)
    }
  })

  // Mounted files
  app.get("/@/*", async (c) => {
    try {
      const authorization = authorizeSpaceRequest(c)
      if (!authorization.allowed) {
        return c.text(authorization.message, authorization.status)
      }
      const { spaceId } = authorization

      const dataSpace = await ctx.dataSpaceManager.getOrSetDataSpace(spaceId)
      if (!dataSpace) {
        return c.text(`Space not available: ${spaceId}`, 503)
      }

      const requestPath = c.req.path.replace("/@/", "")
      const parts = requestPath.split("/")
      const mountName = parts[0]
      const relativePath = parts.slice(1).join("/")

      const mountKey = `eidos:space:files:mount:${mountName}`
      const mountPath = await dataSpace.kv.get(mountKey, "text")

      if (!mountPath) {
        return c.text(`Mount not found: ${mountName}`, 404)
      }

      const fullPath = path.join(mountPath, relativePath)

      if (
        !fullPath.startsWith(mountPath + path.sep) &&
        fullPath !== mountPath
      ) {
        return c.text("Access denied", 403)
      }

      return serveFile(fullPath, c)
    } catch (error: any) {
      return c.text(`Error serving mounted file: ${error.message}`, 500)
    }
  })
}
