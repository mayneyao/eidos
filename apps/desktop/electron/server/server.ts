import { handleFunctionCall } from '@/packages/core/rpc';
import aiHandler, { pathname as aiPath } from '@/worker/service-worker/ai';
import { serve } from '@hono/node-server';
import { log } from 'electron-log';
import { Hono } from 'hono';
import { getOrSetDataSpace } from '../data-space';
import { getFileFromPath, getSpaceFileFromPath } from '../file-system/space';
import { serveStatic } from './server-static';
import { interceptExtensionRequest } from './ext-server';
import { ProxyHandler } from '@/packages/sandbox/proxy-handler';

const app = new Hono();

app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    const hostname = url.hostname;

    // Skip CORS handling for proxy requests - they handle their own CORS
    if (hostname === 'proxy.eidos.localhost') {
        await next();
        return;
    }

    const requestOrigin = c.req.header('Origin');
    let isAllowedOrigin = false;

    if (requestOrigin) {
        try {
            const originUrl = new URL(requestOrigin);
            // Allow requests from *.eidos.localhost
            // e.g. http://3ujmmomr.block.25-w19.eidos.localhost:13127
            if (originUrl.hostname.endsWith('.eidos.localhost')) {
                isAllowedOrigin = true;
                c.header('Access-Control-Allow-Origin', requestOrigin);
                c.header('Vary', 'Origin');
                c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
                c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
                c.header('Access-Control-Allow-Credentials', 'true');
            }
        } catch (e) {
            // Use the existing log from 'electron-log' if available in this scope,
            // or consider adding error logging if needed.
            log('Invalid Origin header:', requestOrigin, e);
        }
    }

    // Handle preflight (OPTIONS) requests for allowed origins
    if (c.req.method === 'OPTIONS' && isAllowedOrigin) {
        // Respond to preflight requests with 204 No Content.
        // CORS headers are already set if isAllowedOrigin is true.
        return c.body(null, 204);
    }

    // These COOP/COEP headers were in the original middleware.
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Embedder-Policy", "require-corp");

    await next(); // Continue to the next middleware or route handler
});



const handleStaticFile = async (c: any) => {
    const pathname = new URL(c.req.url).pathname
    const file = getFileFromPath(pathname)
    const headers = new Headers()
    headers.append("Content-Type", file.type)
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")
    return new Response(file, { headers })
}

export function startServer({ dist, port }: { dist: string, port: number }) {

    // Proxy handler for proxy.eidos.localhost requests
    const proxyHandler = new ProxyHandler();

    app.use('*', async (c, next) => {
        const url = new URL(c.req.url);
        const hostname = url.hostname;

        // Check if this is a proxy request
        if (hostname === 'proxy.eidos.localhost') {
            // Handle CORS preflight requests
            if (c.req.method === 'OPTIONS') {
                return await proxyHandler.handleOptionsRequest(c);
            }

            // Handle status endpoint
            if (url.pathname === '/status') {
                return await proxyHandler.getProxyStatus(c);
            }

            // Handle proxy requests
            return await proxyHandler.handleProxyRequest(url, c);
        }

        // Continue to next middleware if not a proxy request
        await next();
    });

    // New middleware to intercept *.eidos.localhost requests
    app.use('*', interceptExtensionRequest(dist, port));

    // host static files
    app.use('/*', serveStatic({ root: dist }));
    log('static files served from', dist)

    // handle api calls
    app.post('/rpc', async (c) => {
        try {
            const { space, method, params, scope } = await c.req.json();
            if (space) {
                const dataSpace = await getOrSetDataSpace(space);
                log('rpc', method, params, space, dataSpace.dbName)
                const result = await handleFunctionCall({ method, params, space, dbName: space, userId: 'unknown' }, dataSpace);
                return c.json({ success: true, data: result });
            } else {
                throw new Error('Invalid request, space is required')
            }
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    });

    // AI completion route
    // app.post(aiCompletionPath, async (c) => {
    //     const response = await aiCompletionHandler({
    //         request: c.req,
    //         respondWith: (response: Response) => response,
    //     } as unknown as FetchEvent);
    //     return response;
    // });

    // AI route
    app.all(aiPath, async (c) => {
        const response = await aiHandler({
            request: c.req,
            respondWith: (response: Response) => response,
        } as unknown as FetchEvent, {
            getDataspace: (space) => space ? getOrSetDataSpace(space) : Promise.resolve(null)
        });
        return response;
    });

    // 
    app.get('/:space/files/*', async (c) => {
        const space = c.req.param('space');
        const fullPath = c.req.path;
        const filePath = fullPath.replace(`/${space}/files/`, '');
        const pathname = `/${space}/files/${filePath}`;

        const file = getSpaceFileFromPath(pathname)
        const headers = new Headers()
        headers.append("Content-Type", file.type)
        headers.append("Cross-Origin-Embedder-Policy", "require-corp")
        headers.append("Cross-Origin-Resource-Policy", "cross-origin")
        headers.append("Accept-Ranges", "bytes")

        const rangeHeader = c.req.header('range')
        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
            if (match) {
                const start = parseInt(match[1])
                const end = match[2] ? parseInt(match[2]) : file.size - 1
                const chunk = file.slice(start, end + 1)

                headers.append("Content-Range", `bytes ${start}-${end}/${file.size}`)
                headers.append("Content-Length", String(chunk.size))
                return new Response(chunk, {
                    status: 206,
                    headers
                })
            }
        }

        return new Response(file, { headers })
    })

    app.get('/static/*', async (c) => handleStaticFile(c))

    app.get('/extensions/*', async (c) => handleStaticFile(c))

    // Fallback to index.html for non-existent paths
    app.use('*', serveStatic({ path: `${dist}/index.html` }));

    serve({
        port,
        fetch: app.fetch,
    }, (info) => {
        log(`Server is running on ${info.address}:${info.port}`)
    })
}
