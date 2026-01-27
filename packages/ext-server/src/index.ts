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
  IBindings,
} from "./types";

// Middleware
export { createExtensionMiddleware } from "./middleware";

// HTML template
export { getIndexHtml } from "./ext-html";
export type { IndexHtmlProps, ExtensionContext } from "./ext-html";

// Theme and config
export { twConfig, presetThemes } from "./helper";
export type { Theme } from "./helper";

