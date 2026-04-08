import { serveStatic } from "../server-static"

/**
 * Create static files middleware
 */
export function createStaticFiles(dist: string) {
  return serveStatic({ root: dist })
}

/**
 * Create SPA fallback middleware (serves index.html for all unmatched routes)
 */
export function createSpaFallback(dist: string) {
  return serveStatic({ path: `${dist}/index.html` })
}
