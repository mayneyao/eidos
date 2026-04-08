/**
 * Desktop-specific dependencies for ext-server
 *
 * This module provides pre-configured dependencies for Electron desktop app,
 * including ConfigManager theme support and SpaceRegistry sync status.
 *
 * @example
 * ```typescript
 * import { createExtensionMiddleware, createDesktopConfig } from '@eidos.space/ext-server/desktop';
 *
 * app.use('*', createExtensionMiddleware(createDesktopConfig({
 *   getDataSpace,
 *   getConfigManager,
 *   getSpaceRegistry,
 *   dist: '/path/to/dist',
 * })));
 * ```
 */

import fs from "fs"
import path from "path"
import { ScriptSandboxHandler, type SandboxLogger } from "./script-sandbox"
import { makeSdkInjectScript } from "./helper"
import {
  extractFunction,
  getAllLibs,
  generateImportMap,
  uiComponentsDependencies,
} from "@eidos.space/v3"
import type { ExtServerConfig, ExtensionProvider } from "./types"

export interface DesktopConfigOptions {
  /**
   * Function to get DataSpace for a given space ID
   */
  getDataSpace: (spaceId: string) => Promise<any>

  /**
   * Function to get ConfigManager instance
   */
  getConfigManager: () => {
    get(key: "theme"): {
      customThemes?: Array<{ name: string; css: string }>
      currentThemeName?: string
    }
  }

  /**
   * Function to get SpaceRegistry instance
   */
  getSpaceRegistry: () => {
    getSpace(
      spaceId: string
    ): { sync?: { enabled?: boolean } } | null | undefined
  }

  /**
   * Path to dist directory for compiled-ui files
   */
  dist: string

  /**
   * Server port
   */
  port?: number

  /**
   * Logger for ext-server
   */
  logger?: SandboxLogger
}

/**
 * Create extension provider for desktop
 */
function createDesktopExtensionProvider(
  dataSpace: any,
  spaceRegistry: {
    getSpace(id: string): { sync?: { enabled?: boolean } } | null | undefined
  },
  spaceId: string
): ExtensionProvider {
  return {
    getById: async (id) => dataSpace.script.get(id),
    getBySlug: async (slug) => dataSpace.extension.getExtensionBySlug(slug),
    getBySlugOrId: async (slugOrId) =>
      dataSpace.extension.getExtensionBySlugOrId(slugOrId),
    getThemeMode: async () =>
      dataSpace.kv.get("eidos:space:settings:theme:mode"),
    getSyncEnabled: () =>
      spaceRegistry.getSpace(spaceId)?.sync?.enabled ?? false,
    dataSpace,
  }
}

/**
 * Create pre-configured ExtServerConfig for desktop Electron app
 */
export function createDesktopConfig(
  options: DesktopConfigOptions
): ExtServerConfig {
  const { getDataSpace, getConfigManager, getSpaceRegistry, dist, port } =
    options

  return {
    getExtensionProvider: async (spaceId) => {
      const dataSpace = await getDataSpace(spaceId)
      return createDesktopExtensionProvider(
        dataSpace,
        getSpaceRegistry(),
        spaceId
      )
    },

    dependencies: {
      makeSdkInjectScript,
      extractFunction,
      getAllLibs,
      generateImportMap,
      uiComponentsDependencies,
      createSandboxHandler: (getScriptCode) =>
        new ScriptSandboxHandler(getScriptCode, options.logger),
    },

    port,

    // Theme support from ConfigManager
    getCustomThemes: () => getConfigManager().get("theme").customThemes || [],
    getCurrentThemeName: () => getConfigManager().get("theme").currentThemeName,

    // Serve compiled UI files from dist
    serveCompiledUI: (pathname: string) => {
      try {
        return fs.readFileSync(path.join(dist, pathname))
      } catch {
        return null
      }
    },
  }
}

// Re-export for convenience
export { createExtensionMiddleware } from "./middleware"
export type { ExtServerConfig, ExtensionProvider, IExtension } from "./types"
