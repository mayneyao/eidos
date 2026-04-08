import { session } from "electron"

import { Injectable, Inject, container } from "../../common/di"
import { ConfigManager } from "../config/config-manager"

/**
 * CORS Service - Unified CORS handling for Eidos Desktop
 *
 * Philosophy: All CORS handling is done at the Hono server level (server.ts),
 * not at the Electron webRequest level. This avoids conflicts and makes
 * CORS behavior predictable and debuggable.
 *
 * This service only handles:
 * 1. Security-related header filtering (Origin modification for trusted domains)
 * 2. COOP/COEP headers for cross-origin isolation (required for SharedArrayBuffer)
 */
@Injectable()
export class CorsService {
  private isInitialized = false

  constructor(@Inject(ConfigManager) private configManager: ConfigManager) {}

  public initialize() {
    if (this.isInitialized) return
    this.isInitialized = true

    this.configManager.on("configChanged", (data) => {
      if (data.key === "security") {
        this.updateSettings()
      }
    })

    this.updateSettings()
  }

  private updateSettings() {
    const securityConfig = this.configManager.get("security")
    const domains = securityConfig.crossOriginDomains || []
    const allDomains = [...domains, "*.eidos.localhost"]

    // Clear existing handlers
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ["*://*/*"] },
      null
    )
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: ["*://*/*"] },
      null
    )

    if (allDomains.length === 0) return

    const filter = { urls: allDomains.map((domain) => `*://${domain}/*`) }

    /**
     * Modify Origin header for trusted domains to enable seamless cross-origin communication
     * This is a security trade-off for the desktop app's multi-subdomain architecture
     */
    session.defaultSession.webRequest.onBeforeSendHeaders(
      filter,
      (details, callback) => {
        const url = new URL(details.url)
        // Only modify Origin for same-domain requests (not RPC or proxy)
        const isSameDomain = allDomains.some((domain) =>
          url.hostname.endsWith(domain.replace("*.", ""))
        )
        // Skip proxy subdomains: *.proxy.eidos.localhost
        const isProxyDomain = url.hostname.endsWith(".proxy.eidos.localhost")
        if (isSameDomain && !details.url.includes("/rpc") && !isProxyDomain) {
          details.requestHeaders["Origin"] = ""
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    /**
     * Note: We intentionally do NOT set CORS headers (Access-Control-Allow-*) here.
     * All CORS headers are set by the Hono server (server.ts) to ensure:
     * 1. Single source of truth for CORS policy
     * 2. No duplicate or conflicting headers
     * 3. Easier debugging and maintenance
     *
     * We only set COOP/COEP headers here for cross-origin isolation (required for SharedArrayBuffer/WASM)
     */
    session.defaultSession.webRequest.onHeadersReceived(
      filter,
      (details, callback) => {
        const url = new URL(details.url)

        // Skip if server already handled it (server.ts sets these headers)
        const hasServerCors =
          details.responseHeaders?.["access-control-allow-origin"] ||
          details.responseHeaders?.["Access-Control-Allow-Origin"]

        if (hasServerCors) {
          callback({ responseHeaders: details.responseHeaders })
          return
        }

        // Only set COOP/COEP for same-domain resources (not RPC, not proxy)
        const isSameDomain = allDomains.some((domain) =>
          url.hostname.endsWith(domain.replace("*.", ""))
        )
        // Skip proxy subdomains: *.proxy.eidos.localhost
        const isProxyDomain = url.hostname.endsWith(".proxy.eidos.localhost")

        if (isSameDomain && !url.pathname.includes("/rpc") && !isProxyDomain) {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Cross-Origin-Opener-Policy": "same-origin",
              "Cross-Origin-Embedder-Policy": "require-corp",
              "Cross-Origin-Resource-Policy": "cross-origin",
            },
          })
        } else {
          callback({ responseHeaders: details.responseHeaders })
        }
      }
    )
  }
}

// Backward compatibility
export const CorsManager = CorsService
export const corsManager = {
  initialize() {
    const corsService = container.get(CorsService)
    corsService.initialize()
  },
}
