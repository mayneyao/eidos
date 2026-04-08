import {
  createDesktopConfig,
  createExtensionMiddleware,
} from "@eidos.space/ext-server/desktop"
import type { ServerContext } from "../server"

/**
 * Create extension middleware for serving extension assets and API
 */
export function createExtension(
  ctx: ServerContext,
  dist: string,
  port: number
) {
  return createExtensionMiddleware(
    createDesktopConfig({
      getDataSpace: ctx.dataSpaceManager.getOrSetDataSpace.bind(
        ctx.dataSpaceManager
      ),
      getConfigManager: () => ({
        get: ctx.configManager.get.bind(ctx.configManager),
        set: ctx.configManager.set.bind(ctx.configManager),
      }),
      getSpaceRegistry: () => ({
        getSpace: ctx.spaceRegistry.getSpace.bind(ctx.spaceRegistry),
        getAllSpaces: ctx.spaceRegistry.getAllSpaces.bind(ctx.spaceRegistry),
        validateSpace: ctx.spaceRegistry.validateSpace.bind(ctx.spaceRegistry),
      }),
      dist,
      port,
    })
  )
}
