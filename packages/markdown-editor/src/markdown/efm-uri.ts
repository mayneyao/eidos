const DENIED_URI_SCHEME = /^(?:javascript|vbscript|data|file):/iu

export function normalizeEfmUri(uri: string): string {
  // Browsers ignore whitespace and C0 controls while resolving schemes.
  // eslint-disable-next-line no-control-regex
  return uri.replace(/[\u0000-\u001f\u007f\s]/gu, "")
}

export function resolveEfmResourceUri(
  uri: string,
  baseUri?: string,
  options: { image?: boolean } = {}
): string | null {
  const normalized = normalizeEfmUri(uri)
  if (!normalized || DENIED_URI_SCHEME.test(normalized)) return null

  const scheme = normalized.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]
  if (scheme) {
    const allowed = options.image
      ? ["http", "https"]
      : ["http", "https", "mailto"]
    return allowed.includes(scheme.toLowerCase()) ? uri : null
  }
  if (uri.startsWith("#")) return options.image ? null : uri
  if (!baseUri) return null

  try {
    const resolved = new URL(uri, baseUri)
    const allowed = options.image
      ? ["http:", "https:"]
      : ["http:", "https:", "mailto:"]
    return allowed.includes(resolved.protocol) ? resolved.href : null
  } catch {
    return null
  }
}

/**
 * Validates a host-produced image URL before it reaches an img element. Blob
 * URLs are accepted here because they are presentation-only and are never
 * serialized into Markdown.
 */
export function resolveEfmImagePresentationUri(uri: string): string | null {
  const normalized = normalizeEfmUri(uri)
  if (!normalized) return null
  const scheme = normalized.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]
  return scheme && ["blob", "http", "https"].includes(scheme.toLowerCase())
    ? uri
    : null
}

export function isDeniedEfmUri(uri: string): boolean {
  return DENIED_URI_SCHEME.test(normalizeEfmUri(uri))
}
