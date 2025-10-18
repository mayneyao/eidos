import { handleFunctionCall } from '@eidos.space/core/rpc';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDataSpace } from './data-space.js';
import { existsSync, statSync } from 'fs';
import path from 'path';

// @ts-ignore - Bun types
declare const Bun: any;

const app = new Hono();

interface ServerOptions {
  spaceId: string;
  spacePath: string;
  port: number;
  host: string;
}

let currentSpaceId: string | null = null;
let currentSpacePath: string | null = null;

/**
 * Start the API server for a space
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const { spaceId, spacePath, port, host } = options;
  
  currentSpaceId = spaceId;
  currentSpacePath = spacePath;

  // Enable CORS for all routes
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 600,
    credentials: true,
  }));

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      space: currentSpaceId,
      timestamp: Date.now(),
    });
  });

  // Database status endpoint (for debugging)
  app.get('/debug/db-status', async (c) => {
    const { dbManager } = await import('./data-space.js');
    return c.json({
      status: 'ok',
      database: dbManager.getStatus(),
      timestamp: Date.now(),
    });
  });

  // RPC endpoint
  app.post('/rpc', async (c) => {
    try {
      if (!currentSpaceId) {
        throw new Error('No space loaded');
      }

      const { method, params } = await c.req.json();
      
      if (!method) {
        throw new Error('Method is required');
      }

      const dataSpace = await getDataSpace(currentSpaceId);
      
      console.log(`[RPC] ${method}`, params ? `with ${JSON.stringify(params).substring(0, 100)}` : '');
      
      const result = await handleFunctionCall(
        { 
          method, 
          params: params || [], 
          space: currentSpaceId, 
          dbName: currentSpaceId, 
          userId: 'cli-user' 
        }, 
        dataSpace
      );

      return c.json({ 
        success: true, 
        data: result 
      });
    } catch (error: any) {
      console.error('[RPC Error]', error);
      return c.json({ 
        success: false, 
        error: error.message || 'Unknown error'
      }, 400);
    }
  });

  // File serving endpoint
  app.get('/files/*', async (c) => {
    try {
      if (!currentSpacePath) {
        throw new Error('No space loaded');
      }

      const requestPath = c.req.path.replace('/files/', '');
      const filePath = path.join(currentSpacePath, '.eidos', 'files', requestPath);

      if (!existsSync(filePath)) {
        return c.text('File not found', 404);
      }

      const stat = statSync(filePath);
      
      if (!stat.isFile()) {
        return c.text('Not a file', 400);
      }

      // Read file with Bun
      const file = Bun.file(filePath);
      
      return c.body(file.stream() as any, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Length': stat.size.toString(),
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    } catch (error: any) {
      console.error('[File Error]', error);
      return c.text(`Error: ${error.message}`, 500);
    }
  });

  // Catch-all for undefined routes
  app.notFound((c) => {
    return c.json({ 
      error: 'Not found',
      path: c.req.path,
    }, 404);
  });

  // Start server with Bun
  return new Promise((resolve) => {
    Bun.serve({
      fetch: app.fetch,
      port,
      hostname: host,
      development: false,
    });
    
    console.log(`Server listening on http://${host}:${port}`);
    resolve();
  });
}

