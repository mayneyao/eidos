/**
 * HTTP server for headless Eidos
 * Uses Hono with Node.js adapter
 */

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createExtensionMiddleware, createEidosDependencies } from '@eidos.space/ext-server/eidos'
import { handleFunctionCall } from '../rpc'
import { HeadlessConfig } from '../config/env'
import { getDataSpace } from '../data-space'
import fs from 'node:fs'
import path from 'node:path'

// Static JS assets from ext-server package
import appWrapperJs from '@eidos.space/ext-server/src/js/app-wrapper.js?raw'
import swJs from '@eidos.space/ext-server/src/js/sw.js?raw'
import tailwindRawJs from '@eidos.space/ext-server/src/js/tailwind-raw.js?raw'
import eidosClientJs from '@eidos.space/client/dist/index.mjs?raw'

let currentConfig: HeadlessConfig | null = null

export async function startServer(config: HeadlessConfig): Promise<void> {
  const app = new Hono()
  currentConfig = config

  const COMPILED_UI_DIR = config.compiledUiDir
  
  // Custom hostname patterns for production (e.g., Cloudflare flattened domains)
  const hostnamePattern = config.extensionHostnamePattern 
    ? new RegExp(config.extensionHostnamePattern, 'i') 
    : undefined;
  const sandboxHostnamePattern = config.sandboxHostnamePattern 
    ? new RegExp(config.sandboxHostnamePattern, 'i') 
    : undefined;

  // Debug logging for domain matching
  app.use('*', async (c, next) => {
    if (process.env.DEBUG_DOMAINS === '1') {
      const rawUrl = c.req.url;
      const hostname = new URL(rawUrl).hostname;
      const hostHeader = c.req.header('host');
      const isExtensionMatch = !!(hostnamePattern && hostname.match(hostnamePattern));
      const isSandboxMatch = !!(sandboxHostnamePattern && hostname.match(sandboxHostnamePattern));
      
      console.log(`[Request] ${c.req.method} ${rawUrl}`);
      console.log(`[Domain Check] URL Hostname: "${hostname}"`);
      console.log(`[Domain Check] Host Header: "${hostHeader}"`);
      console.log(`[Domain Check] Pattern: "${config.extensionHostnamePattern || 'not set'}"`);
      console.log(`[Domain Check] Result: ${isExtensionMatch ? 'EXTENSION_MATCH' : isSandboxMatch ? 'SANDBOX_MATCH' : 'NO_MATCH'}`);
    }
    await next();
  })

  // Extension middleware - intercepts <extId>.block.<spaceId>.eidos.localhost requests
  app.use('*', createExtensionMiddleware({
    getExtensionProvider: async () => {
      const dataSpace = await getDataSpace(config)
      return {
        getById: async (id) => dataSpace.script.get(id),
        getBySlug: async (slug) => dataSpace.extension.getExtensionBySlug(slug),
        getBySlugOrId: async (slugOrId) => dataSpace.extension.getExtensionBySlugOrId(slugOrId),
        getThemeMode: async () => dataSpace.kv.get('eidos:space:settings:theme:mode'),
        dataSpace
      }
    },
    hostnamePattern,
    sandboxHostnamePattern,
    dependencies: createEidosDependencies(),
    port: config.port,
    staticAssets: {
      appWrapperJs,
      swJs,
      tailwindRawJs,
      eidosClientJs,
    },
    serveCompiledUI: (pathname) => {
      // Internal path starts with /compiled-ui/
      const fileName = pathname.replace('/compiled-ui/', '');
      const filePath = path.join(COMPILED_UI_DIR, fileName);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return null;
    }
  }))
  
  // Enable CORS
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 600,
    credentials: true,
  }))
  
  // Auth Middleware
  app.use('*', async (c, next) => {
    const path = c.req.path.replace(/\/$/, '')
    const isProtected = path === '/rpc' || path.startsWith('/graft')
    
    if (!isProtected) return await next()
    
    if (!config.apiKey) {
      // Log only once on first protected request if needed, but here we log every check for debugging
      // console.log(`[Auth Check] Path: ${path}, API Key not configured, skipping.`)
      return await next()
    }
    
    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${config.apiKey}`) {
      return await next()
    }
    
    console.warn(`[Auth Check] Unauthorized access attempt to ${path}. Expected Bearer token.`)
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  })
  
  // Health check
  app.get('/health', async (c) => {
    const spaceId = config.s3Prefix.split('/')[0] || 'headless'
    return c.json({
      status: 'ok',
      space: spaceId,
      timestamp: Date.now(),
    })
  })
  
  // RPC endpoint
  app.post('/rpc', async (c) => {
    try {
      const { method, params, space } = await c.req.json()
      
      if (!method) {
        throw new Error('Method is required')
      }
      
      const dataSpace = await getDataSpace(config)
      const spaceId = space || config.s3Prefix.split('/')[0] || 'headless'
      
      console.log(`[RPC] ${method}`, params ? `with ${JSON.stringify(params).substring(0, 100)}` : '')
      
      const result = await handleFunctionCall(
        {
          method,
          params: params || [],
          space: spaceId,
          dbName: spaceId,
          userId: 'headless-user',
        },
        dataSpace
      )
      
      return c.json({
        success: true,
        data: result,
      })
    } catch (error: any) {
      console.error('[RPC Error]', error)
      return c.json({
        success: false,
        error: error.message || 'Unknown error',
      }, 400)
    }
  })
  
  // Graft endpoints
  app.get('/graft/status', async (c) => {
    try {
      const dataSpace = await getDataSpace(config)
      const status = await (dataSpace.db as any).status()
      return c.json({ success: true, data: status })
    } catch (error: any) {
      console.error('[Graft Status Error]', error)
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  app.post('/graft/pull', async (c) => {
    try {
      const dataSpace = await getDataSpace(config)
      const result = await (dataSpace.db as any).pull()
      return c.json({ success: true, data: result })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  app.post('/graft/push', async (c) => {
    try {
      const dataSpace = await getDataSpace(config)
      const result = await (dataSpace.db as any).push()
      return c.json({ success: true, data: result })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // In-memory cache for signed URLs
  const signedUrlCache = new Map<string, { url: string; expires: number }>()
  const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

  // Files serving - Redirect to S3
  app.get('/files/*', async (c) => {
    const requestPath = c.req.path.replace('/files/', '')
    const s3Key = `${config.s3FilesPrefix}/${requestPath}`.replace(/\/+/g, '/')
    
    try {
      const now = Date.now()
      const cached = signedUrlCache.get(s3Key)
      
      if (cached && cached.expires > now + 60 * 1000) {
        return c.redirect(cached.url, 302)
      }

      const { AwsClient } = await import('aws4fetch')
      const aws = new AwsClient({
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
        region: config.awsRegion,
        service: 's3',
      })

      // Construct S3 URL
      let urlStr = ''
      if (config.awsEndpoint.includes('cloudflarestorage.com') || config.awsEndpoint.includes('s3.amazonaws.com')) {
        const endpoint = config.awsEndpoint.replace(/^https?:\/\//, '')
        urlStr = `https://${config.s3BucketName}.${endpoint}/${s3Key}`
      } else {
        urlStr = `${config.awsEndpoint.replace(/\/$/, '')}/${config.s3BucketName}/${s3Key}`
      }
      
      const url = new URL(urlStr)
      const signedRequest = await aws.sign(url, {
        method: 'GET',
        // @ts-ignore
        signQuery: true,
      })

      const signedUrl = signedRequest.url
      signedUrlCache.set(s3Key, {
        url: signedUrl,
        expires: now + CACHE_TTL
      })

      return c.redirect(signedUrl, 302)
    } catch (error: any) {
      console.error('[File Redirect Error]', error)
      return c.text(`Error: ${error.message}`, 500)
    }
  })
  
  // 404 handler
  app.notFound((c) => {
    return c.json({
      error: 'Not found',
      path: c.req.path,
    }, 404)
  })
  
  // Start server
  const buildTime = new Date().toISOString();
  console.log(`Starting server on ${config.host}:${config.port}...`)
  console.log(`[Build] Time: ${buildTime}`)
  
  serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  }, (info) => {
    console.log(`✓ Server running at http://${config.host}:${info.port}`)
    console.log('')
    console.log('Available endpoints:')
    console.log(`  POST /rpc         - RPC API`)
    console.log(`  GET  /files/*     - File access`)
    console.log(`  GET  /health      - Health check`)
    console.log(`  GET  /graft/status - Sync status`)
    console.log(`  POST /graft/pull  - Pull from remote`)
    console.log(`  POST /graft/push  - Push to remote`)
  })
}
