import type { Context, Next } from 'hono';
import { proxy } from 'hono/proxy';

/**
 * Logger interface for dependency injection
 */
export interface ProxyLogger {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

// Default logger using console
const defaultLogger: ProxyLogger = {
  log: (...args) => console.log('[Proxy]', ...args),
  error: (...args) => console.error('[Proxy]', ...args),
};

/**
 * Proxy Middleware Configuration
 */
export interface ProxyMiddlewareConfig {
  /** Base domain for proxy subdomains (e.g., 'eidos.localhost') */
  baseDomain: string;
  /** Custom logger */
  logger?: ProxyLogger;
  /** Whether to require HTTPS for target URLs */
  requireHttps?: boolean;
}

/**
 * Build proxy headers, filtering out problematic ones
 */
function buildProxyHeaders(c: Context): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};

  // Headers to skip (security/proxy-related)
  const skipHeaders = new Set([
    'host', 'connection', 'upgrade', 'proxy-connection',
    'proxy-authenticate', 'proxy-authorization', 'te', 'trailers'
  ]);

  // Forward safe headers
  const originalHeaders = c.req.raw.headers;
  originalHeaders.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!skipHeaders.has(lowerKey)) {
      headers[key] = value;
    }
  });

  return headers;
}

/**
 * Validate if the target URL is allowed to be proxied
 */
function isValidTargetUrl(targetUrl: string, requireHttps: boolean = true): boolean {
  try {
    const url = new URL(targetUrl);

    // Only allow HTTPS (or HTTP if not required)
    if (requireHttps && url.protocol !== 'https:') {
      return false;
    }
    if (!requireHttps && !['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Block localhost and private IP ranges for security
    const hostname = url.hostname.toLowerCase();

    // Block localhost variations
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges (basic check)
    if (hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
      return false;
    }

    // Block internal domains
    if (hostname.endsWith('.localhost') ||
        hostname.endsWith('.local')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): void {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Access-Control-Allow-Credentials', 'false');
}

/**
 * Create Proxy Middleware for Hono
 * 
 * Subdomain pattern: <target-host>.proxy.<base-domain>/<path> -> https://<target-host>/<path>
 * Example: api.openai.com.proxy.eidos.localhost/v1/chat -> https://api.openai.com/v1/chat
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createProxyMiddleware } from '@eidos.space/proxy';
 * 
 * const app = new Hono();
 * app.use('*', createProxyMiddleware({ baseDomain: 'eidos.localhost' }));
 * ```
 */
export function createProxyMiddleware(config: ProxyMiddlewareConfig) {
  const logger = config.logger || defaultLogger;
  const requireHttps = config.requireHttps ?? true;
  const proxyPattern = new RegExp(`^(.+)\\.proxy\\.${config.baseDomain.replace(/\./g, '\\.')}$`);

  return async function proxyMiddleware(c: Context, next: Next): Promise<Response | void> {
    const url = new URL(c.req.url);
    const hostname = url.hostname;

    // Check if this is a proxy request
    const proxyMatch = hostname.match(proxyPattern);
    if (!proxyMatch) {
      // Not a proxy request, continue to next middleware
      return await next();
    }

    const targetHost = proxyMatch[1];

    // Handle CORS preflight
    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    try {
      // Construct target URL
      const protocol = requireHttps ? 'https' : 'http';
      const targetUrl = `${protocol}://${targetHost}${url.pathname}${url.search}`;

      logger.log(`${hostname}${url.pathname} -> ${targetUrl}`);

      // Validate target URL
      if (!isValidTargetUrl(targetUrl, requireHttps)) {
        return c.text('Invalid or blocked target URL', 400);
      }

      // Proxy the request
      const response = await proxy(targetUrl, {
        ...c.req,
        headers: {
          ...buildProxyHeaders(c),
          'X-Forwarded-For': '127.0.0.1',
          'X-Forwarded-Host': targetHost,
          'User-Agent': c.req.header('User-Agent') || 'Eidos-Proxy/1.0',
          'Accept': c.req.header('Accept') || '*/*',
        },
      });

      // Add CORS headers
      addCorsHeaders(response);

      logger.log(`Proxy completed: ${response.status}`);
      return response;

    } catch (error: any) {
      logger.error(`Proxy error: ${error.message}`);
      return c.text(`Proxy error: ${error.message}`, 500);
    }
  };
}

export default createProxyMiddleware;
