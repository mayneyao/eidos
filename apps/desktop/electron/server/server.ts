import { OAUTH_CONFIG } from "@/lib/const"
import aiHandler, { pathname as aiPath } from "@/worker/service-worker/ai"
import {
  getProcessByPort,
  isPortInUse,
  type PortOccupancyInfo,
} from "../services/port-checker"
import { createProxyMiddleware } from "@eidos.space/proxy"
import {
  containsBinaryData,
  parseMultipartFormData,
  processBinaryDataForResponse,
  restoreBinaryData,
} from "@eidos.space/client"
import {
  createExtensionMiddleware,
  createDesktopConfig,
} from "@eidos.space/ext-server/desktop"
import { createBucketBrowserMiddleware } from "@eidos.space/sync"
import { serve } from "@hono/node-server"
import { BrowserWindow } from "electron"
import log from "electron-log"
import { Hono } from "hono"
import path from "path"
import {
  CredentialsManager,
  type OAuthTokens,
  type UserInfo,
} from "../services/credentials"
import { getConfigManager } from "../services/config-manager"
import { getOrSetDataSpace } from "../data-space"
import { getFileFromPath, getSpaceFileFromPath } from "../file-system/space"
import { getSpaceRegistry } from "../services/space-registry"
import { serveFile } from "./serve-file"
import { serveStatic } from "./server-static"

// Channel name for auth state changes
export const AUTH_STATE_CHANGED_CHANNEL = "auth-state-changed"

/**
 * Broadcast auth state change to all renderer windows
 */
function broadcastAuthStateChange(
  authenticated: boolean,
  user?: UserInfo | null
) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(AUTH_STATE_CHANGED_CHANNEL, { authenticated, user })
  })
}

const app = new Hono()

/**
 * Extract spaceId from hostname using regex patterns
 *
 * Supported patterns:
 * - <spaceId>.eidos.localhost -> spaceId
 * - <extId>.block.<spaceId>.eidos.localhost -> spaceId
 * - sandbox.<spaceId>.eidos.localhost -> spaceId
 *
 * @param hostname like sandbox.<spaceId>.eidos.localhost or <extensionId>.block.<spaceId>.eidos.localhost
 * @returns spaceId
 */
function extractSpaceIdFromHostname(hostname: string): string | null {
  // Pattern: <extId>.block.<spaceId>.eidos.localhost
  const blockPattern = /^[\w-]+\.block\.([\w-]+)\.eidos\.localhost$/
  // Pattern: sandbox.<spaceId>.eidos.localhost
  const sandboxPattern = /^sandbox\.([\w-]+)\.eidos\.localhost$/
  // Pattern: <spaceId>.eidos.localhost
  const standardPattern = /^([\w-]+)\.eidos\.localhost$/

  const blockMatch = hostname.match(blockPattern)
  if (blockMatch) {
    return blockMatch[1]
  }

  const sandboxMatch = hostname.match(sandboxPattern)
  if (sandboxMatch) {
    return sandboxMatch[1]
  }

  const standardMatch = hostname.match(standardPattern)
  if (standardMatch) {
    return standardMatch[1]
  }

  return null
}

/**
 * Extract spaceId from request, considering X-Forwarded-Host header
 * This supports DNS workaround where *.localhost is rewritten to 127.0.0.1
 */
function extractSpaceIdFromRequest(c: any): string | null {
  // Try X-Forwarded-Host first (for DNS workaround)
  const forwardedHost = c.req.header("X-Forwarded-Host")
  if (forwardedHost) {
    // Remove port if present (e.g., "host:13127" -> "host")
    const hostWithoutPort = forwardedHost.split(":")[0]
    const spaceId = extractSpaceIdFromHostname(hostWithoutPort)
    if (spaceId) {
      return spaceId
    }
  }

  // Fallback to URL hostname
  const url = new URL(c.req.url)
  return extractSpaceIdFromHostname(url.hostname)
}

/**
 * Unified CORS Configuration
 * Single source of truth for all CORS settings
 */
const CORS_CONFIG = {
  // Origins that are allowed to make requests
  allowedOrigins: ["*.eidos.localhost"],
  // Whether to allow credentials (cookies, auth headers)
  allowCredentials: true,
  // Allowed HTTP methods
  allowedMethods: "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
  // Allowed headers
  allowedHeaders:
    "Content-Type, Authorization, X-Requested-With, X-Forwarded-Host",
}

/**
 * Check if an origin is allowed
 * Handles both normal origins and "null" (opaque origin from sandboxed iframe)
 */
function isAllowedOrigin(
  origin: string | null | undefined,
  hostname: string
): boolean {
  // Handle opaque origin (sandboxed iframe sends "null")
  if (origin === "null") {
    // Allow opaque origins from sandbox subdomains or localhost (desktop mode)
    return (
      (hostname.startsWith("sandbox.") &&
        hostname.endsWith(".eidos.localhost")) ||
      hostname === "127.0.0.1" ||
      hostname === "localhost"
    )
  }

  // No origin header - allow if from sandbox subdomain or localhost (desktop mode)
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
    // Allow all *.eidos.localhost origins
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
  // For sandbox requests with opaque/null origin, use wildcard
  if (
    (origin === "null" || !origin) &&
    hostname.startsWith("sandbox.") &&
    hostname.endsWith(".eidos.localhost")
  ) {
    return "*"
  }
  // For normal cross-origin requests, echo the origin
  return origin || "*"
}

/**
 * Unified CORS middleware
 * All CORS handling happens here - no other layer should set CORS headers
 */
app.use("*", async (c, next) => {
  const url = new URL(c.req.url)
  const hostname = url.hostname
  const requestOrigin = c.req.header("Origin")

  // Skip CORS handling for proxy subdomains - they handle their own CORS
  // Pattern: *.proxy.eidos.localhost (e.g., api.openai.com.proxy.eidos.localhost)
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

  // Handle preflight (OPTIONS) requests
  if (c.req.method === "OPTIONS" && allowed) {
    return c.body(null, 204)
  }

  // COOP/COEP headers for cross-origin isolation (required for SharedArrayBuffer/WASM)
  c.header("Cross-Origin-Opener-Policy", "same-origin")
  c.header("Cross-Origin-Embedder-Policy", "require-corp")

  await next()
})

const handleStaticFile = async (c: any) => {
  const pathname = new URL(c.req.url).pathname
  const file = getFileFromPath(pathname)
  const headers = new Headers()
  headers.append("Content-Type", file.type)
  headers.append("Cross-Origin-Embedder-Policy", "require-corp")
  return c.newResponse(file as any, { headers })
}

export interface PortInUseError extends Error {
  port: number
  processInfo?: PortOccupancyInfo | null
}

export async function startServer({
  dist,
  port,
}: {
  dist: string
  port: number
}): Promise<void> {
  // Check if port is already in use
  const portOccupied = await isPortInUse(port)
  if (portOccupied) {
    const processInfo = await getProcessByPort(port)
    const error = new Error(`Port ${port} is already in use`) as PortInUseError
    error.port = port
    error.processInfo = processInfo
    throw error
  }
  // Bucket browser middleware: handles storage.eidos.localhost
  // Provides a simple web UI for browsing S3-compatible buckets
  app.use(
    "*",
    createBucketBrowserMiddleware({
      getCredentials: async () => {
        const configManager = getConfigManager()
        const defaultProviderId = configManager.getDefaultSyncProvider()
        if (!defaultProviderId) return null

        const credentials =
          await CredentialsManager.getSyncCredentials(defaultProviderId)
        const providerConfig = configManager.getSyncProvider(defaultProviderId)

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

  // Proxy middleware: handles *.proxy.eidos.localhost subdomains
  // Pattern: <target-host>.proxy.eidos.localhost/<path> -> https://<target-host>/<path>
  app.use("*", createProxyMiddleware({ baseDomain: "eidos.localhost" }))

  // New middleware to intercept *.eidos.localhost requests
  app.use(
    "*",
    createExtensionMiddleware(
      createDesktopConfig({
        getDataSpace: getOrSetDataSpace,
        getConfigManager,
        getSpaceRegistry,
        dist,
        port,
      })
    )
  )

  // host static files
  app.use("/*", serveStatic({ root: dist }))
  log.info("static files served from", dist)

  // OIDC Implementation with PKCE

  // Initiate OAuth flow with PKCE
  app.get("/api/auth/login", async (c) => {
    try {
      // Generate PKCE parameters
      const pkce = CredentialsManager.generatePKCE()

      // Store code_verifier in memory for later use in callback
      CredentialsManager.setCodeVerifier(pkce.codeVerifier)

      // Build authorization URL with PKCE parameters
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
      // Retrieve the stored code_verifier from memory
      const codeVerifier = CredentialsManager.getAndClearCodeVerifier()
      if (!codeVerifier) {
        return c.text(
          "PKCE code_verifier not found. Please start the login process again.",
          400
        )
      }

      // Exchange code for tokens using PKCE (no client_secret needed)
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

      log.info("tokens", tokens)
      // Store tokens securely
      await CredentialsManager.setTokens(tokens)

      // Fetch user info using the access token
      const userInfoUrl = `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.USERINFO}`
      const userInfoResponse = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })

      let user: UserInfo | null = null
      if (userInfoResponse.ok) {
        user = await userInfoResponse.json()
        // Store user info separately (non-sensitive data)
        await CredentialsManager.setUserInfo(user!)
      } else {
        // Fallback if userinfo fails
        log.error("Failed to fetch user info")
      }

      // Broadcast auth state change to frontend
      broadcastAuthStateChange(true, user)

      return c.html(`
                <html>
                    <body>
                        <h1>Login Successful</h1>
                        <p>You can close this window and return to Eidos.</p>
                        <script>
                            // Optional: Try to close window or focus app
                            // window.close();
                        </script>
                    </body>
                </html>
            `)
    } catch (error: any) {
      return c.text(`Authentication error: ${error.message}`, 500)
    }
  })

  app.get("/api/auth/user", async (c) => {
    try {
      // Try to get a valid access token (will auto-refresh if needed)
      // This call will automatically refresh the token if it's expired
      const accessToken = await CredentialsManager.getAccessToken()
      if (!accessToken) {
        // Token refresh failed, broadcast logout event to frontend
        broadcastAuthStateChange(false, null)
        return c.json({ authenticated: false }, 401)
      }

      const user = await CredentialsManager.getUserInfo()

      return c.json({
        authenticated: true,
        user: user,
        // Don't expose tokens in the API response for security
        hasValidTokens: true,
      })
    } catch (error: any) {
      log.error("Error checking authentication status:", error)
      return c.json({ authenticated: false, error: error.message }, 500)
    }
  })

  app.post("/api/auth/logout", async (c) => {
    try {
      // Get tokens before clearing for server-side logout
      const tokens = await CredentialsManager.getTokens()

      // Notify server to end session if we have an id_token
      if (tokens?.id_token) {
        try {
          const endSessionUrl = new URL(
            `${OAUTH_CONFIG.AUTH_SERVER_BASE_URL}${OAUTH_CONFIG.ENDPOINTS.END_SESSION}`
          )
          endSessionUrl.searchParams.set("id_token_hint", tokens.id_token)

          await fetch(endSessionUrl.toString(), {
            method: "GET",
          })
        } catch (endSessionError) {
          // Log but don't fail - still clear local credentials
          log.error("Failed to end session on server:", endSessionError)
        }
      }

      // Clear local credentials
      await CredentialsManager.clearAll()
      // Broadcast auth state change to frontend
      broadcastAuthStateChange(false, null)
      return c.json({ success: true })
    } catch (error: any) {
      log.error("Error during logout:", error)
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // Get access token for authenticated API requests
  // This endpoint should only be called from trusted frontend code
  app.get("/api/auth/token", async (c) => {
    try {
      // Try to get a valid access token (will auto-refresh if needed)
      const accessToken = await CredentialsManager.getAccessToken()
      if (!accessToken) {
        // Token refresh failed, broadcast logout event to frontend
        broadcastAuthStateChange(false, null)
        return c.json({ error: "Failed to get access token" }, 401)
      }

      return c.json({ access_token: accessToken })
    } catch (error: any) {
      log.error("Error getting access token:", error)
      return c.json({ error: error.message }, 500)
    }
  })

  // handle api calls
  app.post("/rpc", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        throw new Error("Invalid request, space ID not found in hostname")
      }

      const registry = getSpaceRegistry()
      const space = registry.getSpace(spaceId)
      if (!space) {
        throw new Error(`Space not found: ${spaceId}`)
      }

      let method, params, scope
      const contentType = c.req.header("content-type") || ""

      if (contentType.includes("multipart/form-data")) {
        // Handle form-data request with binary data
        const formData = await parseMultipartFormData(c.req.raw)
        const jsonData = JSON.parse(formData.json || "{}")

        // Restore binary data from form fields
        const binaryDataMap: Record<string, any> = {}
        for (const [key, value] of Object.entries(formData)) {
          if (key.startsWith("binary_")) {
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

      const dataSpace = await getOrSetDataSpace(spaceId)
      log.info(`rpc[${spaceId}]`, method)
      const result = await (dataSpace as any)._executePayload({
        method,
        params,
        space: spaceId,
        dbName: spaceId,
        userId: "unknown",
      })
      // const result = await handleFunctionCall({ method, params, space: spaceId, dbName: spaceId, userId: 'unknown' }, dataSpace);

      // Check if result contains binary data and handle accordingly
      if (containsBinaryData(result)) {
        // Use multipart form data for binary responses
        const formData = new FormData()
        formData.append("json", JSON.stringify({ success: true }))

        // Extract binary data and add as separate fields
        let binaryIndex = 0
        const processedResult = processBinaryDataForResponse(
          result,
          (binaryData) => {
            const fieldName = `binary_${binaryIndex++}`
            formData.append(fieldName, binaryData)
            return fieldName
          }
        )

        // Update the JSON data to include the processed result
        formData.set(
          "json",
          JSON.stringify({ success: true, data: processedResult })
        )

        // Note: CORS headers are set by the global middleware above
        return c.newResponse(formData as any)
      } else {
        // Regular JSON response
        return c.json({ success: true, data: result })
      }
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400)
    }
  })

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
    const response = await aiHandler(
      {
        request: c.req,
        respondWith: (response: Response) => response,
      } as unknown as FetchEvent,
      {
        getDataspace: (space) =>
          space ? getOrSetDataSpace(space) : Promise.resolve(null),
      }
    )
    return response
  })

  app.get("/files/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const registry = getSpaceRegistry()
      const space = registry.getSpace(spaceId)
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

  app.get("/~/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const registry = getSpaceRegistry()
      const space = registry.getSpace(spaceId)
      if (!space) {
        return c.text(`Space not found: ${spaceId}`, 404)
      }

      const requestPath = c.req.path.replace("/~/", "")
      const fullPath = path.join(space.path, requestPath)

      return serveFile(fullPath, c)
    } catch (error: any) {
      return c.text(`Error serving project file: ${error.message}`, 500)
    }
  })

  app.get("/@/*", async (c) => {
    try {
      const spaceId = extractSpaceIdFromRequest(c)

      if (!spaceId) {
        return c.text("Space ID not found in hostname", 400)
      }

      const dataSpace = await getOrSetDataSpace(spaceId)
      const requestPath = c.req.path.replace("/@/", "")
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

      // Security check - ensure path is within mount directory
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

  // Fallback to index.html for non-existent paths
  app.use("*", serveStatic({ path: `${dist}/index.html` }))

  serve(
    {
      port,
      fetch: app.fetch,
    },
    (info) => {
      log.info(`Server is running on ${info.address}:${info.port}`)
    }
  )
}
