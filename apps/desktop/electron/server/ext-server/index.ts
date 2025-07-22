import { log } from 'electron-log';
import { getOrSetDataSpace } from '../../data-space'; // Assuming data-space.ts is in the parent directory

import appWrapperRaw from './js/app-wrapper.js?raw';
import sw from './js/sw.js?raw';
import tailwindRaw from './js/tailwind-raw.js?raw';

import { ScriptSandboxHandler } from '@/packages/sandbox/script-sandbox';
import fs from 'fs';
import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';
import path from 'path';
import { ServerBlock } from './server-block';



type Ctx = Context<BlankEnv, "*", {}>;

// curl http://287c3686-f1e1-4b10-965e-2daa35a422fc.block.25-w19.eidos.localhost:13127/
// Middleware to intercept <extensionId>.block.<spaceId>.eidos.localhost requests

// server static files from dist/compiled-ui at path /ui
export const interceptExtensionRequest = (dist: string, port: number) => async (c: Ctx, next: any) => {
    const url = new URL(c.req.url);
    const hostname = url.hostname;

    const headers = new Headers()
    headers.append("Content-Type", 'text/javascript')
    headers.append("Cross-Origin-Embedder-Policy", "require-corp")

    if (url.pathname.startsWith('/compiled-ui')) {
        const file = fs.readFileSync(path.join(dist, url.pathname))
        return c.body(file, {
            headers
        });
    }
    if (url.pathname.startsWith('/sw.js')) {
        return new Response(sw, { headers })
    }
    // Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/plain". Strict MIME type checking is enforced for module scripts per HTML spec.
    if (url.pathname.startsWith('/app-wrapper.js')) {
        return new Response(appWrapperRaw, { headers })
    }
    if (url.pathname.startsWith('/tailwind-raw.js')) {
        return new Response(tailwindRaw, { headers })
    }
    // Proxy requests are handled in server.ts, skip them here

    // Check for sandbox domain: sandbox.<spaceId>.eidos.localhost
    const sandboxMatch = hostname.match(/^sandbox\.(.*)\.eidos\.localhost$/);

    if (sandboxMatch) {
        const spaceId = sandboxMatch[1];
        console.log('interceptSandboxRequest', c.req.url);

        // Create script code provider function
        const getScriptCode = async (spaceId: string, scriptId: string): Promise<string | null> => {
            try {
                const dataSpace = await getOrSetDataSpace(spaceId);
                let extension = await dataSpace.script.get(scriptId);
                if (!extension) {
                    // fallback to slug
                    extension = await dataSpace.extension.getExtensionBySlug(scriptId)
                }
                return extension?.code || null;
            } catch (error) {
                log(`Error getting script code for ${scriptId} in space ${spaceId}: ${error}`);
                return null;
            }
        };

        const sandboxHandler = new ScriptSandboxHandler(getScriptCode);
        return await sandboxHandler.handleSandboxRequest(spaceId, url, c);
    }



    // Regex to match <extensionId>.block.<spaceId>.eidos.localhost
    // myext.block.25-w19.eidos.localhost
    const match = hostname.match(/^([a-zA-Z0-9-]+)\.block\.(.*)\.eidos\.localhost$/);

    if (match) {
        const extensionId = match[1];
        const spaceId = match[2];

        // if pathname is /<spaceId>/files/*
        if (url.pathname.startsWith('/' + spaceId + '/files/')) {
            // const file = fs.readFileSync(path.join(dist, url.pathname))
            // redirect to localhost:13127
            return c.redirect(`http://localhost:13127${url.pathname}`)
        }
        console.log('interceptExtensionRequest', c.req.url)
        // log(`Intercepted request for extension: ${extensionId}, space: ${spaceId} on host: ${hostname}`);
        try {
            const dataSpace = await getOrSetDataSpace(spaceId);
            const extension = await dataSpace.script.get(extensionId);
            const compiledCode = extension?.code || ""

            if (url.pathname.startsWith('/app.js')) {
                return c.body(compiledCode, {
                    headers
                });
            }
            const serverBlock = new ServerBlock()
            const html = await serverBlock.run(spaceId, extension, url.toString())
            const htmlResponseHeaders = new Headers();
            // Allow this page to frame content from any http://localhost:* origin and any http://*.eidos.localhost:* origin and any eidos://* origin
            htmlResponseHeaders.append('Content-Security-Policy', "frame-src 'self' http://localhost:* http://*.eidos.localhost:* eidos://*;");
            // It's also good practice to set COOP
            htmlResponseHeaders.append('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
            // Cross-Origin-Resource-Policy: cross-origin
            htmlResponseHeaders.append('Cross-Origin-Resource-Policy', 'cross-origin');
            return c.html(html, { headers: htmlResponseHeaders });
        } catch (error: any) {
            log(`Error processing request for ${hostname}: ${error.message}`);
            return c.text(`Error processing request: ${error.message}`, 500);
        }
    }

    // If the hostname doesn't match, proceed to the next middleware or route handler.
    await next();
}

