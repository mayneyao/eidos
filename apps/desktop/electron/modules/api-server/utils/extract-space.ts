/**
 * Extract spaceId from hostname using regex patterns
 */
export function extractSpaceIdFromHostname(hostname: string): string | null {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")
  if (
    normalizedHostname === "proxy.eidos.localhost" ||
    normalizedHostname.endsWith(".proxy.eidos.localhost")
  ) {
    return null
  }

  const blockPattern = /^[\w-]+\.block\.(.*?)\.eidos\.localhost$/
  const sandboxPattern = /^sandbox\.(.*?)\.eidos\.localhost$/
  const standardPattern = /^(.*?)\.eidos\.localhost$/

  const blockMatch = normalizedHostname.match(blockPattern)
  if (blockMatch) return blockMatch[1] || null

  const sandboxMatch = normalizedHostname.match(sandboxPattern)
  if (sandboxMatch) return sandboxMatch[1] || null

  const standardMatch = normalizedHostname.match(standardPattern)
  if (standardMatch) return standardMatch[1] || null

  return null
}

function hostnameFromAuthority(value: string | undefined): string | null {
  const authority = value?.trim()
  if (!authority || /[,/\\@?#\s]/.test(authority)) return null

  try {
    return new URL(`http://${authority}`).hostname
      .toLowerCase()
      .replace(/\.$/, "")
  } catch {
    return null
  }
}

function requestUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "")
  } catch {
    return null
  }
}

/**
 * Extract a Space id from the HTTP request authority. X-Forwarded-Host is
 * accepted only for the loopback transport shape used by Eidos smart clients.
 */
export function extractSpaceIdFromRequest(c: any): string | null {
  const urlHostname = requestUrlHostname(c.req.url)
  const hostHostname = hostnameFromAuthority(c.req.header("Host"))

  if (hostHostname) {
    const hostSpaceId = extractSpaceIdFromHostname(hostHostname)
    if (hostSpaceId) return hostSpaceId
  }

  if (urlHostname) {
    const urlSpaceId = extractSpaceIdFromHostname(urlHostname)
    if (urlSpaceId) return urlSpaceId
  }

  if (urlHostname === "127.0.0.1" && hostHostname === "127.0.0.1") {
    const forwardedHostname = hostnameFromAuthority(
      c.req.header("X-Forwarded-Host")
    )
    if (forwardedHostname) {
      return extractSpaceIdFromHostname(forwardedHostname)
    }
  }

  return null
}

export type SpaceRequestAuthorization =
  | { allowed: true; spaceId: string }
  | { allowed: false; status: 400 | 403; message: string }

const SPACE_ACCESS_DENIED_MESSAGE =
  "Request access is limited to the current Space"

function extractSourceSpaceId(value: string): string | null {
  try {
    const sourceUrl = new URL(value)
    if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
      return null
    }
    return extractSpaceIdFromHostname(sourceUrl.hostname)
  } catch {
    return null
  }
}

function authorizeSource(
  source: string,
  targetSpaceId: string
): SpaceRequestAuthorization {
  const sourceSpaceId = extractSourceSpaceId(source)
  if (!sourceSpaceId || sourceSpaceId !== targetSpaceId) {
    return {
      allowed: false,
      status: 403,
      message: SPACE_ACCESS_DENIED_MESSAGE,
    }
  }
  return { allowed: true, spaceId: targetSpaceId }
}

/**
 * Authorize browser access to a Space-bound HTTP surface.
 *
 * Browser requests must identify the same Space through Origin or Referer.
 * Origin can be blank because Electron clears it for trusted local requests,
 * so Referer and Fetch Metadata provide the fallback. Requests without browser
 * source headers remain available to direct renderer navigation and native
 * smart clients.
 */
export function authorizeSpaceRequest(c: any): SpaceRequestAuthorization {
  const spaceId = extractSpaceIdFromRequest(c)
  if (!spaceId) {
    return {
      allowed: false,
      status: 400,
      message: "Space ID not found in hostname",
    }
  }

  const rawOrigin = c.req.header("Origin")
  const referer = c.req.header("Referer")?.trim()
  if (rawOrigin !== undefined && rawOrigin.trim() !== "") {
    if (rawOrigin.trim().toLowerCase() === "null") {
      return referer
        ? authorizeSource(referer, spaceId)
        : {
            allowed: false,
            status: 403,
            message: SPACE_ACCESS_DENIED_MESSAGE,
          }
    }
    return authorizeSource(rawOrigin, spaceId)
  }

  if (referer) {
    return authorizeSource(referer, spaceId)
  }

  const fetchSite = c.req.header("Sec-Fetch-Site")?.trim().toLowerCase()
  if (!fetchSite || fetchSite === "none" || fetchSite === "same-origin") {
    return { allowed: true, spaceId }
  }

  return {
    allowed: false,
    status: 403,
    message: SPACE_ACCESS_DENIED_MESSAGE,
  }
}
