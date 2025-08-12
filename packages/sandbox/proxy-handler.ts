import { log } from 'electron-log';
import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';
import { proxy } from 'hono/proxy';

type Ctx = Context<BlankEnv, "*", {}>;

export class ProxyHandler {
    constructor() { }

    /**
     * Handle proxy requests for external URLs using Hono's official proxy helper
     * This provides a secure and optimized proxy service for cross-origin requests
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

            // Use Hono's official proxy helper with optimized header handling
            const response = await proxy(targetUrl, {
                // Forward the original request (including method, body, etc.)
                ...c.req,
                headers: {
                    // Forward most headers but filter out problematic ones
                    ...this.buildProxyHeaders(c),
                    // Add proxy identification headers
                    'X-Forwarded-For': '127.0.0.1',
                    'X-Forwarded-Host': c.req.header('host') || 'eidos.localhost',
                    // Ensure essential headers
                    'User-Agent': c.req.header('User-Agent') || 'Eidos-Proxy/2.0',
                    'Accept': c.req.header('Accept') || '*/*',
                },
            });

            // Add CORS headers to the response
            this.addCorsHeaders(response);
            
            // Clean up potentially problematic headers
            this.cleanupResponseHeaders(response);

            log(`Proxy request completed: ${response.status} ${response.statusText}`);
            return response;

        } catch (error: any) {
            log(`Error handling proxy request: ${error.message}`);
            return c.text(`Proxy error: ${error.message}`, 500);
        }
    }

    /**
     * Build proxy headers, filtering out problematic ones
     */
    private buildProxyHeaders(c: Ctx): Record<string, string | undefined> {
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
     * Add CORS headers to response
     */
    private addCorsHeaders(response: Response): void {
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', '*');
        response.headers.set('Access-Control-Allow-Credentials', 'false');
    }

    /**
     * Clean up potentially problematic response headers
     */
    private cleanupResponseHeaders(response: Response): void {
        // Remove headers that might cause issues with proxying
        const headersToRemove = [
            'content-security-policy',
            'x-frame-options',
            'x-content-type-options'
        ];

        headersToRemove.forEach(header => {
            response.headers.delete(header);
        });
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
            version: '2.0.0',
            engine: 'Hono Official Proxy Helper',
            features: [
                'Hono native proxy support',
                'Optimized streaming',
                'Automatic encoding handling',
                'CORS support',
                'URL validation',
                'Security filtering',
                'Binary data optimization'
            ],
            improvements: [
                'Better arrayBuffer() support',
                'Native streaming performance',
                'Reduced memory usage',
                'Automatic Accept-Encoding handling'
            ]
        };

        return c.json(status);
    }
}
