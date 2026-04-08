import { createProxyMiddleware } from "@eidos.space/proxy"

/**
 * Create proxy middleware for proxy subdomains
 */
export function createProxy() {
  return createProxyMiddleware({ baseDomain: "eidos.localhost" })
}
