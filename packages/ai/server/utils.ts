export function extractText(parts: unknown[] | undefined): string {
  if (!parts) return ""
  return (parts as any[])
    .filter((p) => p?.type === "text")
    .map((p) => p.text ?? "")
    .join("")
}

export function extractSpace(c: any): string {
  // 1. Check query parameter
  let space = c.req.query("space")
  if (space) return space

  const url = new URL(c.req.url)

  // 2. Subdomain of request
  const parts = url.hostname.split(".")
  if (parts.length > 2 && parts[0] !== "www" && parts[0] !== "ext") {
    return parts[0]
  }

  // 3. Check forwarded host
  const forwardedHost = c.req.header("X-Forwarded-Host")
  if (forwardedHost) {
    const parts = forwardedHost.split(":")[0].split(".")
    if (parts.length > 2 && parts[0] !== "www" && parts[0] !== "ext") {
      return parts[0]
    }
  }

  // 4. Referer
  const referer = c.req.header("referer")
  if (referer) {
    try {
      const refUrl = new URL(referer)
      const refParts = refUrl.hostname.split(".")
      if (
        refParts.length > 2 &&
        refParts[0] !== "www" &&
        refParts[0] !== "ext"
      ) {
        return refParts[0]
      }
      const pathParts = refUrl.pathname.split("/").filter(Boolean)
      if (pathParts[0] && pathParts[0] !== "agent") {
        return pathParts[0]
      }
    } catch (e) {
      // ignore
    }
  }

  return "default"
}
