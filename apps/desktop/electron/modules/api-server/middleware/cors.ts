/**
 * Unified CORS Configuration
 */
export const CORS_CONFIG = {
  allowedOrigins: ["*.eidos.localhost"],
  allowCredentials: true,
  allowedMethods: "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
  allowedHeaders:
    "Content-Type, Authorization, X-Requested-With, X-Forwarded-Host",
}

/**
 * Check if an origin is allowed
 */
export function isAllowedOrigin(
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
export function getAllowOrigin(
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
 * Create CORS middleware with security headers
 */
export function createCorsMiddleware() {
  return async (c: any, next: any) => {
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

    // Security headers for SharedArrayBuffer support
    c.header("Cross-Origin-Opener-Policy", "same-origin")
    c.header("Cross-Origin-Embedder-Policy", "require-corp")

    await next()
  }
}
