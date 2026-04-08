/**
 * API Server - HTTP server implementation for Eidos Desktop
 *
 * This module provides the HTTP server using Hono framework.
 * It handles static files, RPC calls, OAuth, and extension middleware.
 */

import { OAUTH_CONFIG } from "@/lib/const"
import aiHandler, { pathname as aiPath } from "@/worker/service-worker/ai"
import {
  containsBinaryData,
  parseMultipartFormData,
  processBinaryDataForResponse,
  restoreBinaryData,
} from "@eidos.space/client"
import {
  createDesktopConfig,
  createExtensionMiddleware,
} from "@eidos.space/ext-server/desktop"
import { createProxyMiddleware } from "@eidos.space/proxy"
import { createBucketBrowserMiddleware } from "@eidos.space/sync"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import path from "path"
import { getSpaceFileFromPath } from "../../utils/paths"
import { serveFile } from "./serve-file"
import { serveStatic } from "./server-static"
import type { Logger } from "../logger/logger.module"

// Re-export types
export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  id_token?: string
}

export interface UserInfo {
  id: string
  email?: string
  name?: string
  picture?: string
  [key: string]: any
}

export interface PortOccupancyInfo {
  port: number
  pid?: number
  processName?: string
  processPath?: string
}

export interface PortInUseError extends Error {
  port: number
  processInfo?: PortOccupancyInfo | null
}

// Port checker interface
export interface PortChecker {
  isPortInUse(port: number): Promise<boolean>
  getProcessByPort(port: number): Promise<PortOccupancyInfo | null>
}

// Server context interface (passed during server start)
export interface ServerContext {
  dataSpaceManager: {
    getOrSetDataSpace(spaceId: string): Promise<any | null>
    getDataSpace(): any | null
  }
  configManager: {
    get(key: string): any
    set(key: string, value: any): void
    getDefaultSyncProvider(): string | undefined
    getSyncProvider(id: string): { region?: string } | undefined
    on(event: string, callback: Function): void
  }
  spaceRegistry: {
    getSpace(spaceId: string): any | undefined | null
    getAllSpaces(): any[]
    validateSpace(spaceId: string): boolean
  }
  portChecker: PortChecker
  credentialsManager: {
    getSyncCredentials(providerId: string): Promise<any | null>
    getTokens(): Promise<OAuthTokens | null>
    setTokens(tokens: OAuthTokens): Promise<void>
    getUserInfo(): Promise<UserInfo | null>
    setUserInfo(userInfo: UserInfo): Promise<void>
    isAuthenticated(): Promise<boolean>
    clearAll(): Promise<void>
    getAccessToken(): Promise<string | null>
  }
  broadcastAuthStateChange: (
    authenticated: boolean,
    user?: UserInfo | null
  ) => void
  logger: Logger
}

// Channel name for auth state changes
export const AUTH_STATE_CHANGED_CHANNEL = "auth-state-changed"

// Simple PKCE implementation
let codeVerifierStore: string | null = null

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return base64URLEncode(new Uint8Array(hash))
}

function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

/**
 * Extract spaceId from hostname using regex patterns
 */
function extractSpaceIdFromHostname(hostname: string): string | null {
  const blockPattern = /^[\w-]+\.block\.([\w-]+)\.eidos\.localhost$/
  const sandboxPattern = /^sandbox\.([\w-]+)\.eidos\.localhost$/
  const standardPattern = /^([\w-]+)\.eidos\.localhost$/

  const blockMatch = hostname.match(blockPattern)
  if (blockMatch) return blockMatch[1]

  const sandboxMatch = hostname.match(sandboxPattern)
  if (sandboxMatch) return sandboxMatch[1]

  const standardMatch = hostname.match(standardPattern)
  if (standardMatch) return standardMatch[1]

  return null
}

/**
 * Extract spaceId from request, considering X-Forwarded-Host header
 */
function extractSpaceIdFromRequest(c: any): string | null {
  const forwardedHost = c.req.header("X-Forwarded-Host")
  if (forwardedHost) {
    const hostWithoutPort = forwardedHost.split(":")[0]
    const spaceId = extractSpaceIdFromHostname(hostWithoutPort)
    if (spaceId) return spaceId
  }

  const url = new URL(c.req.url)
  return extractSpaceIdFromHostname(url.hostname)
}

/**
 * Unified CORS Configuration
 */
const CORS_CONFIG = {
  allowedOrigins: ["*.eidos.localhost"],
  allowCredentials: true,
  allowedMethods: "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
  allowedHeaders:
    "Content-Type, Authorization, X-Requested-With, X-Forwarded-Host",
}

/**
 * Check if an origin is allowed
 */
function isAllowedOrigin(
  origin: string | null | undefined,
  hostname: string
): boolean {
  if (origin === "null") {
    return (
      (hostname.startsWith("sandbox.") &&
        hostname.endsWith(".eidos.localhost")) ||
      hostname === "127.0.0.1" ||
      hostname === "localhost"
    )
  }

  if (!origin) {
    return (
      (hostname.startsWith("sandbox.") &&
        hostname.endsWith(".eidos.localhost")) ||
      hostname === "127.0.0.1" ||
      hostname === "localhost"
    )
  }

  try {
    const originUrl = new URL(origin)
    return originUrl.hostname.endsWith(".eidos.localhost")
  } catch {
    return false
  }
}

/**
 * Get the appropriate Access-Control-Allow-Origin value
 */
function getAllowOrigin(
  origin: string | null | undefined,
  hostname: string
): string {
  if (
    (origin === "null" || !origin) &&
    hostname.startsWith("sandbox.") &&
    hostname.endsWith(".eidos.localhost")
  ) {
    return "*"
  }
  return origin || "*"
}

/**
 * Create and configure the Hono app with all middleware and routes
 */
function createApp(dist: string, port: number, ctx: ServerContext): Hono {
  const app = new Hono()

  // CORS middleware
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url)
    const hostname = url.hostname
    const requestOrigin = c.req.header("Origin")

    // Skip CORS handling for proxy subdomains
    if (hostname.endsWith(".proxy.eidos.localhost")) {
      await next()
      return
    }

    const allowed = isAllowedOrigin(requestOrigin, hostname)

    if (allowed) {
      c.header(
        "Access-Control-Allow-Origin",
        getAllowOrigin(requestOrigin, hostname)
      )
      c.header("Vary", "Origin")
      c.header("Access-Control-Allow-Methods", CORS_CONFIG.allowedMethods)
      c.header("Access-Control-Allow-Headers", CORS_CONFIG.allowedHeaders)
      if (CORS_CONFIG.allowCredentials) {
        c.header("Access-Control-Allow-Credentials", "true")
      }
    }

    if (c.req.method === "OPTIONS" && allowed) {
      return c.body(null, 204)
    }

    c.header("Cross-Origin-Opener-Policy", "same-origin")
    c.header("Cross-Origin-Embedder-Policy", "require-corp")

    await next()
  })

  // Bucket browser middleware
  app.use(
    "*",
    createBucketBrowserMiddleware({
      getCredentials: async () => {
        const defaultProviderId = ctx.configManager.getDefaultSyncProvider()
        if (!defaultProviderId) return null

        const credentials =
          await ctx.credentialsManager.getSyncCredentials(defaultProviderId)
        const providerConfig =
          ctx.configManager.getSyncProvider(defaultProviderId)

        if (!credentials || !providerConfig) return null

        return {
          endpoint: credentials.endpoint,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          bucketName: credentials.bucketName,
          region: providerConfig.region || "auto",
        }
      },
    })
  )

  // Proxy middleware
  app.use("*", createProxyMiddleware({ baseDomain: "eidos.localhost" }))

  // Extension middleware
  app.use(
    "*",
    createExtensionMiddleware(
      createDesktopConfig({
        getDataSpace: ctx.dataSpaceManager.getOrSetDataSpace.bind(
          ctx.dataSpaceManager
        ),
        getConfigManager: () => ({
          get: ctx.configManager.get.bind(ctx.configManager),
          set: ctx.configManager.set.bind(ctx.configManager),
        }),
        getSpaceRegistry: () => ({
          getSpace: ctx.spaceRegistry.getSpace.bind(ctx.spaceRegistry),
          getAllSpaces: ctx.spaceRegistry.getAllSpaces.bind(ctx.spaceRegistry),
          validateSpace: ctx.spaceRegistry.validateSpace.bind(
            ctx.spaceRegistry
          ),
        }),
        dist,
        port,
      })
    )
  )

  // Static files
  app.use("/*", serveStatic({ root: dist }))
  ctx.logger.info("static files served from", dist)

  // OAuth routes
  setupOAuthRoutes(app, ctx)

  // API routes
  setupApiRoutes(app, ctx)

  // File serving routes
  setupFileRoutes(app, ctx)

  // Fallback to index.html
  app.use("*", serveStatic({ path: `${dist}/index.html` }))

  return app
}

/**
 * Setup OAuth authentication routes
 */
function setupOAuthRoutes(app: Hono, ctx: ServerContext) {
  // Initiate OAuth flow with PKCE
  app.get("/api/auth/login", async (c) => {
    try {
      const pkce = {
        codeVerifier: generateCodeVerifier(),
        codeChallenge: "",
        codeChallengeMethod: "S256" as const,
      }
      pkce.codeChallenge = await generateCodeChallenge(pkce.codeVerifier)
      codeVerifierStore = pkce.codeVerifier

      const authUrl = new URL(
        `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.AUTHORIZE}`
      )
      authUrl.searchParams.set("client_id", OAUTH_CONFIG.CLIENT_ID)
      authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.REDIRECT_URI)
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("scope", OAUTH_CONFIG.SCOPES)
      authUrl.searchParams.set("code_challenge", pkce.codeChallenge)
      authUrl.searchParams.set(
        "code_challenge_method",
        pkce.codeChallengeMethod
      )
      authUrl.searchParams.set("prompt", "consent")

      return c.json({ url: authUrl.toString() })
    } catch (error: any) {
      return c.json({ error: error.message }, 500)
    }
  })

  // OAuth callback
  app.get("/oauth/callback", async (c) => {
    const url = new URL(c.req.url)
    const code = url.searchParams.get("code")
    const error = url.searchParams.get("error")

    if (error) {
      const errorDescription =
        url.searchParams.get("error_description") || error
      return c.html(`
        <html>
          <body>
            <h1>Login Failed</h1>
            <p>${errorDescription}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `)
    }

    if (!code) {
      return c.text("No code provided", 400)
    }

    try {
      const codeVerifier = codeVerifierStore
      codeVerifierStore = null
      if (!codeVerifier) {
        return c.text(
          "PKCE code_verifier not found. Please start the login process again.",
          400
        )
      }

      const tokenUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.TOKEN}`
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.CLIENT_ID,
          redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
          grant_type: "authorization_code",
          code: code,
          code_verifier: codeVerifier,
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        return c.text(`Token exchange failed: ${errorText}`, 500)
      }

      const tokens: OAuthTokens = await tokenResponse.json()
      ctx.logger.info("tokens", tokens)
      await ctx.credentialsManager.setTokens(tokens)

      const userInfoUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.USERINFO}`
      const userInfoResponse = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })

      let user: UserInfo | null = null
      if (userInfoResponse.ok) {
        user = await userInfoResponse.json()
        await ctx.credentialsManager.setUserInfo(user!)
      } else {
        ctx.logger.error("Failed to fetch user info")
      }

      ctx.broadcastAuthStateChange(true, user)

      return c.html(`
        <html>
          <body>
            <h1>Login Successful</h1>
            <p>You can close this window and return to Eidos.</p>
          </body>
        </html>
      `)
    } catch (error: any) {
      return c.text(`Authentication error: ${error.message}`, 500)
    }
  })

  // Get current user
  app.get("/api/auth/user", async (c) => {
    try {
      const accessToken = await ctx.credentialsManager.getAccessToken()
      if (!accessToken) {
        ctx.broadcastAuthStateChange(false, null)
        return c.json({ authenticated: false }, 401)
      }

      const user = await ctx.credentialsManager.getUserInfo()

      return c.json({
        authenticated: true,
        user: user,
        hasValidTokens: true,
      })
    } catch (error: any) {
      ctx.logger.error("Error checking authentication status:", error)
      return c.json({ authenticated: false, error: error.message }, 500)
    }
  })

  // Logout
  app.post("/api/auth/logout", async (c) => {
    try {
      const tokens = await ctx.credentialsManager.getTokens()

      if (tokens?.id_token) {
        try {
          const endSessionUrl = new URL(
            `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.END_SESSION}`
          )
          endSessionUrl.searchParams.set("id_token_hint", tokens.id_token)
          await fetch(endSessionUrl.toString(), { method: "GET" })
        } catch (endSessionError) {
          ctx.logger.error("Failed to end session on server:", endSessionError)
        }
      }

      await ctx.credentialsManager.clearAll()
      ctx.broadcastAuthStateChange(false, null)
      return c.json({ success: true })
    } catch (error: any) {
      ctx.logger.error("Error during logout:", error)
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // Get access token
  app.get("/api/auth/token", async (c) => {
    try {
      const accessToken = await ctx.credentialsManager.getAccessToken()
      if (!accessToken) {
        ctx.broadcastAuthStateChange(false, null)
        return c.json({ error: "Failed to get access token" }, 401)
      }

      return c.json({ access_token: accessToken })
    } catch (error: any) {
      ctx.logger.error("Error getting access token:", error)
      return c.json({ error: error.message }, 500)
    }
  })
}

/**
 * Setup API routes (RPC, AI)
 */
function setupApiRoutes(app: Hono, ctx: ServerContext) {
  // RPC endpoint
  app.post("/rpc", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        throw new Error("Invalid request, space ID not found in hostname")
      }

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        throw new Error(`Space not found: ${spaceId}`)
      }

      let method, params, scope
      const contentType = c.req.header("content-type") || ""

      if (contentType.includes("multipart/form-data")) {
        const formData = await parseMultipartFormData(c.req.raw)
        const jsonData = JSON.parse(formData.json || "{}")

        const binaryDataMap: Record<string, any> = {}
        for (const [key, value] of Object.entries(formData)) {
          if (key.startsWith("binary_")) {
            binaryDataMap[key] = value
          }
        }

        method = jsonData.method
        params = restoreBinaryData(jsonData.params, binaryDataMap)
        scope = jsonData.scope
      } else {
        const jsonData = await c.req.json()
        method = jsonData.method
        params = jsonData.params
        scope = jsonData.scope
      }

      const dataSpace = await ctx.dataSpaceManager.getOrSetDataSpace(spaceId)
      ctx.logger.info(`rpc[${spaceId}]`, method)
      const result = await (dataSpace as any)._executePayload({
        method,
        params,
        space: spaceId,
        dbName: spaceId,
        userId: "unknown",
      })

      if (containsBinaryData(result)) {
        const formData = new FormData()
        formData.append("json", JSON.stringify({ success: true }))

        let binaryIndex = 0
        const processedResult = processBinaryDataForResponse(
          result,
          (binaryData) => {
            const fieldName = `binary_${binaryIndex++}`
            formData.append(fieldName, binaryData)
            return fieldName
          }
        )

        formData.set(
          "json",
          JSON.stringify({ success: true, data: processedResult })
        )

        return c.newResponse(formData as any)
      } else {
        return c.json({ success: true, data: result })
      }
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400)
    }
  })

  // AI route
  app.all(aiPath, async (c) => {
    const response = await aiHandler(
      {
        request: c.req,
        respondWith: (response: Response) => response,
      } as unknown as FetchEvent,
      {
        getDataspace: (space) =>
          space
            ? ctx.dataSpaceManager.getOrSetDataSpace(space)
            : Promise.resolve(null),
      }
    )
    return response
  })
}

/**
 * Setup file serving routes
 */
function setupFileRoutes(app: Hono, ctx: ServerContext) {
  // Files from space storage
  app.get("/files/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        return c.text(`Space not found: ${spaceId}`, 404)
      }

      const fullPath = c.req.path
      const filePath = fullPath.replace("/files/", "")

      const file = getSpaceFileFromPath(spaceId, filePath)
      const headers = new Headers()
      headers.append("Content-Type", file.type)
      headers.append("Cross-Origin-Embedder-Policy", "require-corp")
      headers.append("Cross-Origin-Resource-Policy", "cross-origin")
      headers.append("Accept-Ranges", "bytes")

      const rangeHeader = c.req.header("range")
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1])
          const end = match[2] ? parseInt(match[2]) : file.size - 1
          const chunk = file.slice(start, end + 1)

          headers.append("Content-Range", `bytes ${start}-${end}/${file.size}`)
          headers.append("Content-Length", String(chunk.size))
          return c.newResponse(chunk as any, {
            status: 206,
            headers,
          })
        }
      }

      return c.newResponse(file as any, { headers })
    } catch (error: any) {
      return c.text(`Error serving file: ${error.message}`, 500)
    }
  })

  // Project files
  app.get("/~/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const space = ctx.spaceRegistry.getSpace(spaceId)
      if (!space) {
        return c.text(`Space not found: ${spaceId}`, 404)
      }

      const requestPath = c.req.path.replace("/~", "")
      const fullPath = path.join(space.path, requestPath)

      return serveFile(fullPath, c)
    } catch (error: any) {
      return c.text(`Error serving project file: ${error.message}`, 500)
    }
  })

  // Mounted files
  app.get("/@/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const dataSpace = await ctx.dataSpaceManager.getOrSetDataSpace(spaceId)
      if (!dataSpace) {
        return c.text(`Space not available: ${spaceId}`, 503)
      }

      const requestPath = c.req.path.replace("/@", "")
      const parts = requestPath.split("/")
      const mountName = parts[0]
      const relativePath = parts.slice(1).join("/")

      const mountPath = await dataSpace.kv.get(
        `eidos:space:files:mount:${mountName}`,
        "text"
      )

      if (!mountPath) {
        return c.text(`Mount not found: ${mountName}`, 404)
      }

      const fullPath = path.join(mountPath, relativePath)

      if (
        !fullPath.startsWith(mountPath + path.sep) &&
        fullPath !== mountPath
      ) {
        return c.text("Access denied", 403)
      }

      return serveFile(fullPath, c)
    } catch (error: any) {
      return c.text(`Error serving mounted file: ${error.message}`, 500)
    }
  })
}

/**
 * Start the HTTP server
 */
export async function startServer(
  {
    dist,
    port,
  }: {
    dist: string
    port: number
  },
  ctx: ServerContext
): Promise<void> {
  // Check if port is already in use
  const portOccupied = await ctx.portChecker.isPortInUse(port)
  if (portOccupied) {
    const processInfo = await ctx.portChecker.getProcessByPort(port)
    const error = new Error(`Port ${port} is already in use`) as PortInUseError
    error.port = port
    error.processInfo = processInfo
    throw error
  }

  const app = createApp(dist, port, ctx)

  serve(
    {
      port,
      fetch: app.fetch,
    },
    (info) => {
      ctx.logger.info(`Server is running on ${info.address}:${info.port}`)
    }
  )
}
