import { handleFunctionCall } from '@/lib/rpc';
import { Hono } from 'hono';
import { getOrSetDataSpace } from '../data-space';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { getFileFromPath, getSpaceFileFromPath } from '../file-system/space';
import aiCompletionHandler, { pathname as aiCompletionPath } from '@/worker/service-worker/routes/ai_completion';
import aiHandler, { pathname as aiPath } from '@/worker/service-worker/ai';
import { log } from 'electron-log';

const app = new Hono();

app.use('*', async (c, next) => {
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Embedder-Policy", "require-corp");
    await next();
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

    // host static files
    app.use('/*', serveStatic({ root: dist }));

    // handle api calls
    app.post('/rpc', async (c) => {
        try {
            const { space, method, params } = await c.req.json();
            const dataSpace = await getOrSetDataSpace(space);
            log('rpc', method, params, space, dataSpace.dbName)
            const result = await handleFunctionCall({ method, params, space, dbName: space, userId: 'unknown' }, dataSpace);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    });

    // AI completion route
    app.post(aiCompletionPath, async (c) => {
        const response = await aiCompletionHandler({
            request: c.req,
            respondWith: (response: Response) => response,
        } as unknown as FetchEvent);
        return response;
    });

    // AI route
    app.all(aiPath, async (c) => {
        const response = await aiHandler({
            request: c.req,
            respondWith: (response: Response) => response,
        } as unknown as FetchEvent, {
            getDataspace: (space) => getOrSetDataSpace(space)
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
    })
}
