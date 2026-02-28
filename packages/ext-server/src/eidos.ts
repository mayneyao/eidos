/**
 * Eidos-specific dependencies for ext-server
 *
 * This module provides pre-configured dependencies from @eidos.space packages
 * for easy integration with the Eidos ecosystem.
 *
 * @example
 * ```typescript
 * import { createExtensionMiddleware } from '@eidos.space/ext-server';
 * import { createEidosDependencies } from '@eidos.space/ext-server/eidos';
 *
 * app.use('*', createExtensionMiddleware({
 *   getExtensionProvider: async (spaceId) => myProvider,
 *   dependencies: createEidosDependencies(),
 * }));
 * ```
 */

import { ScriptSandboxHandler } from "./script-sandbox"
import { makeSdkInjectScript } from "./helper"
import {
  extractFunction,
  getAllLibs,
  generateImportMap,
  uiComponentsDependencies,
} from "@eidos.space/v3"
import type { ExtServerDependencies } from "./types"

/**
 * Create pre-configured dependencies for the extension middleware
 * using @eidos.space/v3 packages.
 *
 * This is the recommended way to configure dependencies when using
 * the extension middleware within the Eidos ecosystem.
 */
export function createEidosDependencies(): ExtServerDependencies {
  return {
    makeSdkInjectScript,
    extractFunction,
    getAllLibs,
    generateImportMap,
    uiComponentsDependencies,
    createSandboxHandler: (getScriptCode) =>
      new ScriptSandboxHandler(getScriptCode),
  }
}

// Re-export for convenience
export { createExtensionMiddleware } from "./middleware"
export type { ExtServerConfig, ExtensionProvider, IExtension } from "./types"
