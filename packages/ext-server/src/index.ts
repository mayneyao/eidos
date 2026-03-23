/**
 * @eidos.space/ext-server
 * A standalone Hono middleware for rendering Eidos block extensions
 *
 * This package is designed to be used independently with dependency injection.
 */

// Types
export type {
  ExtServerConfig,
  ExtensionProvider,
  SandboxHandler,
  IExtension,
  BindingType,
  IBinding,
  IBindings,
} from "./types"

// Middleware
export { createExtensionMiddleware } from "./middleware"

// Sandbox
export { ScriptSandboxHandler, type SandboxLogger } from "./script-sandbox"

// SDK Injection
export { makeSdkInjectScript } from "./helper"

// HTML template
export { getIndexHtml } from "./ext-html"
export type { IndexHtmlProps, ExtensionContext } from "./ext-html"

// Theme and config
export { presetThemes } from "./helper"
export type { Theme } from "./helper"
