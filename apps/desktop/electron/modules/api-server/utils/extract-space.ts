/**
 * Extract spaceId from hostname using regex patterns
 */
export function extractSpaceIdFromHostname(hostname: string): string | null {
  const blockPattern = /^[\w-]+\.block\.(.*?)\.eidos\.localhost$/
  const sandboxPattern = /^sandbox\.(.*?)\.eidos\.localhost$/
  const standardPattern = /^(.*?)\.eidos\.localhost$/

  const blockMatch = hostname.match(blockPattern)
  if (blockMatch) return blockMatch[1] || null

  const sandboxMatch = hostname.match(sandboxPattern)
  if (sandboxMatch) return sandboxMatch[1] || null

  const standardMatch = hostname.match(standardPattern)
  if (standardMatch) return standardMatch[1] || null

  return null
}

/**
 * Extract spaceId from request, considering X-Forwarded-Host header
 */
export function extractSpaceIdFromRequest(c: any): string | null {
  const forwardedHost = c.req.header("X-Forwarded-Host")
  console.log("forwardedHost", forwardedHost)
  if (forwardedHost) {
    const hostWithoutPort = forwardedHost.split(":")[0]
    console.log("hostWithoutPort", hostWithoutPort)
    const spaceId = extractSpaceIdFromHostname(hostWithoutPort)
    if (spaceId) return spaceId
  }

  const url = new URL(c.req.url)
  console.log("url", url)
  return extractSpaceIdFromHostname(url.hostname)
}
