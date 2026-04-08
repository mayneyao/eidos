/**
 * Extract spaceId from hostname using regex patterns
 */
export function extractSpaceIdFromHostname(hostname: string): string | null {
  const blockPattern = /^[\w-]+\.\.([\w-]+)\.eidos\.localhost$/
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
export function extractSpaceIdFromRequest(c: any): string | null {
  const forwardedHost = c.req.header("X-Forwarded-Host")
  if (forwardedHost) {
    const hostWithoutPort = forwardedHost.split(":")[0]
    const spaceId = extractSpaceIdFromHostname(hostWithoutPort)
    if (spaceId) return spaceId
  }

  const url = new URL(c.req.url)
  return extractSpaceIdFromHostname(url.hostname)
}
