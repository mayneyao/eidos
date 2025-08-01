import { log } from 'electron-log';
import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';

type Ctx = Context<BlankEnv, "*", {}>;

export class ProxyHandler {
    constructor() { }

    /**
     * Handle proxy requests for external URLs
     * This provides a secure proxy service for cross-origin requests
     */
    async handleProxyRequest(url: URL, c: Ctx): Promise<Response> {
        try {
            log(`Handling proxy request: ${url.toString()}`);
            
            // Get the target URL from query parameters
            const targetUrl = url.searchParams.get('url');
            
            if (!targetUrl) {
                return c.text('Missing target URL parameter', 400);
            }

            // Validate the target URL
            if (!this.isValidTargetUrl(targetUrl)) {
                return c.text('Invalid target URL', 400);
            }

            // Forward most headers but filter out potentially problematic ones
            const headersToForward: Record<string, string> = {};
            
            // Headers to skip (security/proxy-related)
            const skipHeaders = new Set([
                'host', 'connection', 'upgrade', 'proxy-connection',
                'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding'
            ]);

            // Forward all request headers except the ones we skip
            const originalHeaders = c.req.raw.headers;
            originalHeaders.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                if (!skipHeaders.has(lowerKey)) {
                    headersToForward[key] = value;
                }
            });

            // Ensure we have essential headers
            if (!headersToForward['User-Agent']) {
                headersToForward['User-Agent'] = 'Eidos-Proxy/1.0';
            }
            if (!headersToForward['Accept']) {
                headersToForward['Accept'] = '*/*';
            }

            // Add proxy identification
            headersToForward['X-Forwarded-For'] = '127.0.0.1';
            const hostHeader = c.req.header('host');
            if (hostHeader) {
                headersToForward['X-Forwarded-Host'] = hostHeader;
            }

            const requestInit: RequestInit = {
                method: c.req.method,
                headers: headersToForward,
                body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? await c.req.arrayBuffer() : undefined,
            };

            const response = await fetch(targetUrl, requestInit);

            // Create a new response with CORS headers, preserving the body stream
            const responseHeaders = new Headers(response.headers);
            
            // Set CORS headers on the response
            responseHeaders.set('Access-Control-Allow-Origin', '*');
            responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            responseHeaders.set('Access-Control-Allow-Headers', '*');
            responseHeaders.set('Access-Control-Allow-Credentials', 'false');

            // Remove headers that might cause issues
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('content-security-policy');

            const newResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
            });

            return newResponse;

        } catch (error: any) {
            log(`Error handling proxy request: ${error.message}`);
            return c.text(`Proxy error: ${error.message}`, 500);
        }
    }

    /**
     * Handle CORS preflight requests
     */
    async handleOptionsRequest(_c: Ctx): Promise<Response> {
        const headers = new Headers();
        // Note: CORS headers may already be set by the main server middleware
        // Only set if not already present to avoid duplicates
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', '*');
        headers.set('Access-Control-Max-Age', '86400'); // 24 hours

        return new Response(null, { status: 204, headers });
    }

    /**
     * Validate if the target URL is allowed to be proxied
     */
    private isValidTargetUrl(targetUrl: string): boolean {
        try {
            const url = new URL(targetUrl);
            
            // Only allow HTTP and HTTPS protocols
            if (!['http:', 'https:'].includes(url.protocol)) {
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
                hostname.endsWith('.local') ||
                hostname.includes('eidos.localhost')) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get proxy status and health information
     */
    async getProxyStatus(c: Ctx): Promise<Response> {
        const status = {
            service: 'Eidos Proxy Handler',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            features: [
                'CORS support',
                'URL validation',
                'Security filtering',
                'Request forwarding'
            ]
        };

        return c.json(status);
    }
}
