import { handleFunctionCall } from '@/lib/rpc';
import { Hono } from 'hono';
import { getOrSetDataSpace } from '../data-space';
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { getFileFromPath } from '../file-system/space';

const app = new Hono();

app.use('*', async (c, next) => {
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Embedder-Policy", "require-corp");
    await next();
});

export function startServer({ dist, port }: { dist: string, port: number }) {

    // host static files
    app.use('/*', serveStatic({ root: dist }));

    // handle api calls
    app.post('/rpc', async (c) => {
        try {
            const { space, method, params } = await c.req.json();
            const dataSpace = await getOrSetDataSpace(space);
            const result = await handleFunctionCall({ method, params, space, dbName: space, userId: 'unknown' }, dataSpace);
            return c.json({ success: true, data: result });
        } catch (error: any) {
            return c.json({ success: false, error: error.message }, 400);
        }
    });

    // 
    app.get('/:space/files/:filename', async (c) => {
        const { space, filename } = c.req.param()
        const pathname = `/${space}/files/${filename}`
        const file = getFileFromPath(pathname)
        const headers = new Headers()
        headers.append("Content-Type", file.type)
        headers.append("Cross-Origin-Embedder-Policy", "require-corp")

        return new Response(file, { headers })
    })

    serve({
        port,
        fetch: app.fetch,
    })
}
