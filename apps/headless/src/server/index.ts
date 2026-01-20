/**
 * HTTP server for headless Eidos
 * Uses Hono with Node.js adapter
 */

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleFunctionCall } from '../rpc'
import { HeadlessConfig } from '../config/env'
import { getDataSpace } from '../data-space'

const app = new Hono()

let currentConfig: HeadlessConfig | null = null

/**
 * Start the HTTP server
 */
export async function startServer(config: HeadlessConfig): Promise<void> {
  currentConfig = config
  
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
  app.use('/rpc', async (c, next) => {
    if (!config.apiKey) return await next()
    
    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${config.apiKey}`) {
      return await next()
    }
    
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  })

  app.use('/graft/*', async (c, next) => {
    if (!config.apiKey) return await next()
    
    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${config.apiKey}`) {
      return await next()
    }
    
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
  
  // Graft endpoints - use db.* directly since graft getter may not be exposed
  app.get('/graft/status', async (c) => {
    console.log('[Graft] Status request received')
    try {
      const dataSpace = await getDataSpace(config)
      const status = await (dataSpace.db as any).status()
      console.log('[Graft] Status result:', status)
      return c.json({ success: true, data: status })
    } catch (error: any) {
      console.error('[Graft] Error:', error)
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
    // Map to S3 key: {S3_FILES_PREFIX}/{path}
    const s3Key = `${config.s3FilesPrefix}/${requestPath}`.replace(/\/+/g, '/')
    console.log(`[Files] Request received for: ${requestPath}, mapped to S3 key: ${s3Key}`)
    
    try {
      const now = Date.now()
      const cached = signedUrlCache.get(s3Key)
      
      if (cached && cached.expires > now + 60 * 1000) { // Buffer of 1 minute
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
      // Presign the GET request
      // Note: signQuery: true makes it a presigned URL
      const signedRequest = await aws.sign(url, {
        method: 'GET',
        // @ts-ignore - aws4fetch types might be tricky, but this works
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
  console.log(`Starting server on ${config.host}:${config.port}...`)
  
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
