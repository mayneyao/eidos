import { handleFunctionCall } from '@/packages/core/rpc';
import aiHandler, { pathname as aiPath } from '@/worker/service-worker/ai';
import { containsBinaryData, parseMultipartFormData, processBinaryDataForResponse, ProxyHandler, restoreBinaryData } from '@eidos.space/sandbox';
import { serve } from '@hono/node-server';
import { log } from 'electron-log';
import { Hono } from 'hono';
import path from 'path';
import { getOrSetDataSpace } from '../data-space';
import { getFileFromPath, getSpaceFileFromPath } from '../file-system/space';
import { getSpaceRegistry } from '../space-registry';
import { interceptExtensionRequest } from './ext-server';
import { serveFile } from './serve-file';
import { serveStatic } from './server-static';




const app = new Hono();



/**
 * myspace.eidos.localhost -> myspace
 * myext.block.myspace.eidos.localhost -> myspace
 * @param hostname like <spaceId>.eidos.localhost or <extensionId>.block.<spaceId>.eidos.localhost
 * @returns spaceId
 */
function extractSpaceIdFromHostname(hostname: string): string | null {
    const parts = hostname.split('.');

    // Check for extension pattern: <extensionId>.block.<spaceId>.eidos.localhost
    if (parts.length >= 4 && parts[1] === 'block') {
        return parts[2]; // spaceId is at index 2
    }

    // Standard pattern: <spaceId>.eidos.localhost
    if (parts.length >= 2) {
        return parts[0]; // spaceId is at index 0
    }

    return null;
}

function isValidEidosOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);

        // Check if the hostname ends with .eidos.localhost
        // This ensures we only allow legitimate eidos subdomains
        return url.hostname.endsWith('.eidos.localhost') || url.hostname === 'eidos.localhost';
    } catch {
        // If URL parsing fails, it's not a valid origin
        return false;
    }
}

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
            const url = new URL(c.req.url);
            const spaceId = extractSpaceIdFromHostname(url.hostname);

            if (!spaceId) {
                throw new Error('Invalid request, space ID not found in hostname');
            }

            const registry = getSpaceRegistry();
            const space = registry.getSpace(spaceId);
            if (!space) {
                throw new Error(`Space not found: ${spaceId}`);
            }

            let method, params, scope
            const contentType = c.req.header('content-type') || ''

            if (contentType.includes('multipart/form-data')) {
                // Handle form-data request with binary data
                const formData = await parseMultipartFormData(c.req.raw)
                const jsonData = JSON.parse(formData.json || '{}')

                // Restore binary data from form fields
                const binaryDataMap: Record<string, any> = {}
                for (const [key, value] of Object.entries(formData)) {
                    if (key.startsWith('binary_')) {
                        binaryDataMap[key] = value
                    }
                }

                // Replace binary references with actual data
                method = jsonData.method
                params = restoreBinaryData(jsonData.params, binaryDataMap)
                scope = jsonData.scope
            } else {
                // Handle regular JSON request
                const jsonData = await c.req.json()
                method = jsonData.method
                params = jsonData.params
                scope = jsonData.scope
            }

            const dataSpace = await getOrSetDataSpace(spaceId);
            log('rpc', method, params, spaceId, dataSpace.dbName)
            const result = await handleFunctionCall({ method, params, space: spaceId, dbName: spaceId, userId: 'unknown' }, dataSpace);

            // Check if result contains binary data and handle accordingly
            if (containsBinaryData(result)) {
                // Use multipart form data for binary responses
                const formData = new FormData();
                formData.append('json', JSON.stringify({ success: true }));

                // Extract binary data and add as separate fields
                let binaryIndex = 0;
                const processedResult = processBinaryDataForResponse(result, (binaryData) => {
                    const fieldName = `binary_${binaryIndex++}`;
                    formData.append(fieldName, binaryData);
                    return fieldName;
                });

                // Update the JSON data to include the processed result
                formData.set('json', JSON.stringify({ success: true, data: processedResult }));

                return new Response(formData, {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                    }
                });
            } else {
                // Regular JSON response
                return c.json({ success: true, data: result });
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

    app.get('/files/*', async (c) => {
        try {
            const url = new URL(c.req.url);
            const spaceId = extractSpaceIdFromHostname(url.hostname);

            if (!spaceId) {
                return c.text('Space ID not found in hostname', 400);
            }

            const registry = getSpaceRegistry();
            const space = registry.getSpace(spaceId);
            if (!space) {
                return c.text(`Space not found: ${spaceId}`, 404);
            }

            const fullPath = c.req.path;
            const filePath = fullPath.replace('/files/', '');

            const file = getSpaceFileFromPath(spaceId, filePath);
            const headers = new Headers();
            headers.append("Content-Type", file.type);
            headers.append("Cross-Origin-Embedder-Policy", "require-corp");
            headers.append("Cross-Origin-Resource-Policy", "cross-origin");
            headers.append("Accept-Ranges", "bytes");

            const rangeHeader = c.req.header('range');
            if (rangeHeader) {
                const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
                if (match) {
                    const start = parseInt(match[1]);
                    const end = match[2] ? parseInt(match[2]) : file.size - 1;
                    const chunk = file.slice(start, end + 1);

                    headers.append("Content-Range", `bytes ${start}-${end}/${file.size}`);
                    headers.append("Content-Length", String(chunk.size));
                    return new Response(chunk, {
                        status: 206,
                        headers
                    });
                }
            }

            return new Response(file, { headers });
        } catch (error: any) {
            return c.text(`Error serving file: ${error.message}`, 500);
        }
    })

    app.get('/~/*', async (c) => {
        try {
            const url = new URL(c.req.url);
            const spaceId = extractSpaceIdFromHostname(url.hostname);

            if (!spaceId) {
                return c.text('Space ID not found in hostname', 400);
            }

            const registry = getSpaceRegistry();
            const space = registry.getSpace(spaceId);
            if (!space) {
                return c.text(`Space not found: ${spaceId}`, 404);
            }

            const requestPath = c.req.path.replace('/~/', '');
            const fullPath = path.join(space.path, requestPath);

            return serveFile(fullPath, c);
        } catch (error: any) {
            return c.text(`Error serving project file: ${error.message}`, 500);
        }
    });

    app.get('/@/*', async (c) => {
        try {
            const url = new URL(c.req.url);
            const spaceId = extractSpaceIdFromHostname(url.hostname);

            if (!spaceId) {
                return c.text('Space ID not found in hostname', 400);
            }

            const dataSpace = await getOrSetDataSpace(spaceId);
            const requestPath = c.req.path.replace('/@/', '');
            const parts = requestPath.split('/');
            const mountName = parts[0];
            const relativePath = parts.slice(1).join('/');

            const mountPath = await dataSpace.kv.get(`eidos:space:files:mount:${mountName}`, 'text');

            if (!mountPath) {
                return c.text(`Mount not found: ${mountName}`, 404);
            }

            const fullPath = path.join(mountPath, relativePath);

            // Security check - ensure path is within mount directory
            if (!fullPath.startsWith(mountPath + path.sep) && fullPath !== mountPath) {
                return c.text('Access denied', 403);
            }

            return serveFile(fullPath, c);
        } catch (error: any) {
            return c.text(`Error serving mounted file: ${error.message}`, 500);
        }
    });

    // app.get('/static/*', async (c) => handleStaticFile(c))

    // app.get('/extensions/*', async (c) => handleStaticFile(c))

    // Fallback to index.html for non-existent paths
    app.use('*', serveStatic({ path: `${dist}/index.html` }));

    serve({
        port,
        fetch: app.fetch,
    }, (info) => {
        log(`Server is running on ${info.address}:${info.port}`)
    })
}


