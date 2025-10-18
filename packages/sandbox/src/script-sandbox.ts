import { log } from 'electron-log';

import type { Context } from 'hono';
import type { BlankEnv } from 'hono/types';
import { makeSdkInjectScript } from './helper';
import { getExtLibs } from "@/packages/v3/code-tools/get-deps";

// Function type for getting script code - this will be injected by the caller
type GetScriptCodeFunction = (spaceId: string, scriptId: string) => Promise<string | null>;


type Ctx = Context<BlankEnv, "*", {}>;

/**
 * Rewrite external library imports to use esm.sh URLs
 */
function rewriteExternalImports(code: string, externalLibs: string[], excludeLibs: string[] = []): string {
    if (!externalLibs.length) {
        return code;
    }

    let rewrittenCode = code;

    // Create a set for faster lookup
    const extLibsSet = new Set(externalLibs);

    // Regex patterns for different import styles
    const importPatterns = [
        // import ... from "package"
        {
            pattern: /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?["']([^"']+)["']/g,
            type: 'static'
        },
        // import("package")
        {
            pattern: /import\s*\(\s*["']([^"']+)["']\s*\)/g,
            type: 'dynamic'
        },
        // require("package")
        {
            pattern: /require\s*\(\s*["']([^"']+)["']\s*\)/g,
            type: 'require'
        }
    ];

    importPatterns.forEach(({ pattern, type }) => {
        rewrittenCode = rewrittenCode.replace(pattern, (match, packageName) => {
            // Skip local imports (starting with ./ or ../)
            if (packageName.startsWith('./') || packageName.startsWith('../')) {
                return match;
            }

            // Skip path-mapped imports (starting with @/)
            if (packageName.startsWith('@/')) {
                return match;
            }

            // Skip CSS files
            if (packageName.endsWith('.css')) {
                return match;
            }

            // Check if this package is in our external libs list
            if (extLibsSet.has(packageName)) {
                // Skip rewriting if this package is in the exclude list
                if (excludeLibs.includes(packageName)) {
                    console.log(`Skipping rewrite for excluded package: ${packageName}`);
                    return match;
                }
                
                const esmUrl = `https://esm.sh/${packageName}`;
                console.log(`Rewriting ${type} import: ${packageName} -> ${esmUrl}`);
                return match.replace(packageName, esmUrl);
            }

            return match;
        });
    });

    return rewrittenCode;
}

export class ScriptSandboxHandler {
    private getScriptCode: GetScriptCodeFunction | null = null;

    constructor(getScriptCode?: GetScriptCodeFunction) {
        this.getScriptCode = getScriptCode || null;
    }

    /**
     * Handle sandbox.<spaceId>.eidos.localhost requests
     * This provides a secure sandbox environment for script execution
     * and also serves script files directly from the database
     */
    async handleSandboxRequest(spaceId: string, url: URL, c: Ctx): Promise<Response> {
        try {
            log(`Handling sandbox request for space: ${spaceId}, URL: ${url.toString()}`);

            // Handle script file requests: sandbox.<spaceId>.eidos.localhost/scriptid.js
            if (url.pathname.endsWith('.js')) {
                return this.serveScriptFile(spaceId, url, c);
            }

            // Handle different sandbox endpoints
            if (url.pathname === '/') {
                return this.serveSandboxHTML(spaceId, c);
            }

            // Default response for unhandled paths
            return c.text('Sandbox endpoint not found', 404);

        } catch (error: any) {
            log(`Error handling sandbox request for space ${spaceId}: ${error.message}`);
            return c.text(`Sandbox error: ${error.message}`, 500);
        }
    }

    /**
     * Serve script file from database
     * Handles requests like: sandbox.<spaceId>.eidos.localhost/scriptid.js
     */
    private async serveScriptFile(spaceId: string, url: URL, c: Ctx): Promise<Response> {
        const scriptId = url.pathname.slice(1, -3); // Remove leading '/' and trailing '.js'

        // Validate script ID: should not contain '/' (no nested paths) and should not be empty
        if (!scriptId || scriptId.includes('/')) {
            return c.text('Invalid script ID', 400);
        }



        if (!this.getScriptCode) {
            return c.text('Script code provider not configured', 500);
        }

        try {
            const compiledCode = await this.getScriptCode(spaceId, scriptId);

            if (!compiledCode) {
                return c.text(`Script not found: ${scriptId}`, 404);
            }

            const deps = getExtLibs(compiledCode)
            log(`External dependencies found for ${scriptId}:`, deps);

            // Check if no-rewrite parameter is present
            const noRewrite = url.searchParams.get('no-rewrite') === '1';
            
            // Parse external parameter to get list of libraries to exclude from rewriting
            const externalParam = url.searchParams.get('external');
            const excludeLibs = externalParam ? externalParam.split(',').map(lib => lib.trim()) : [];
            
            if (excludeLibs.length > 0) {
                log(`Excluding libraries from rewrite: ${excludeLibs.join(', ')}`);
            }
            
            // Rewrite external imports to use esm.sh URLs (unless no-rewrite=1)
            const rewrittenCode = noRewrite ? compiledCode : rewriteExternalImports(compiledCode, deps, excludeLibs);

            if (deps.length > 0) {
                if (noRewrite) {
                    log(`Skipped rewriting imports for ${scriptId} due to no-rewrite=1 parameter`);
                } else {
                    const excludedCount = excludeLibs.length;
                    const logMessage = excludedCount > 0 
                        ? `Rewritten imports for ${scriptId} (excluded ${excludedCount} libraries). Original length: ${compiledCode.length}, New length: ${rewrittenCode.length}`
                        : `Rewritten imports for ${scriptId}. Original length: ${compiledCode.length}, New length: ${rewrittenCode.length}`;
                    log(logMessage);
                }
            }

            const headers = new Headers();
            headers.append("Content-Type", 'text/javascript');
            headers.append("Cross-Origin-Embedder-Policy", "require-corp");
            headers.append("X-Eidos-External-Libs", JSON.stringify(deps));
            headers.append("Access-Control-Expose-Headers", "X-Eidos-External-Libs");

            return c.body(rewrittenCode, { headers });
        } catch (error: any) {
            log(`Error serving script file ${scriptId} for space ${spaceId}: ${error.message}`);
            return c.text(`Error serving script: ${error.message}`, 500);
        }
    }

    private serveSandboxHTML(spaceId: string, c: Ctx): Response {
        const sdkInjectScriptContent = makeSdkInjectScript({
            space: spaceId,
        })
        const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Eidos Script Container</title>
    ${sdkInjectScriptContent}
  </head>
  <body>
    <p id="message">Loading...</p>
  </body>
</html>
        `;

        // Set permissive headers for sandbox HTML
        const headers = new Headers();
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', '*');

        return c.html(html, { headers });
    }
}
