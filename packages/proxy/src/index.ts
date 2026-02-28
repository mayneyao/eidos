/**
 * @eidos.space/proxy
 *
 * HTTP Proxy service for Eidos with subdomain-based cross-origin request proxying.
 *
 * Usage:
 * ```typescript
 * import { createProxyMiddleware } from '@eidos.space/proxy';
 *
 * app.use('*', createProxyMiddleware({ baseDomain: 'eidos.localhost' }));
 * ```
 *
 * Subdomain pattern:
 * api.example.com.proxy.eidos.localhost/path -> https://api.example.com/path
 */

// Core proxy handler (class-based, for advanced use)
export { ProxyHandler, type ProxyLogger } from "./proxy-handler"

// Hono middleware (recommended for most use cases)
export {
  createProxyMiddleware,
  type ProxyMiddlewareConfig,
  type ProxyLogger as ProxyMiddlewareLogger,
} from "./proxy-middleware"
