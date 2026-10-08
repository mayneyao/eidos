import { selectEidosAndroidDownload } from "./release-routing.mjs"

interface AndroidRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: Array<{ name: string; browser_download_url: string }>
}

const RELEASES_API = "https://api.github.com/repos/mayneyao/eidos/releases"
const MAX_RELEASE_PAGES = 10

function isRelease(value: unknown): value is AndroidRelease {
  if (typeof value !== "object" || value === null) return false
  return (
    "tag_name" in value &&
    typeof value.tag_name === "string" &&
    "draft" in value &&
    typeof value.draft === "boolean" &&
    "prerelease" in value &&
    typeof value.prerelease === "boolean" &&
    "assets" in value &&
    Array.isArray(value.assets) &&
    value.assets.every(
      (asset: unknown) =>
        typeof asset === "object" &&
        asset !== null &&
        "name" in asset &&
        typeof asset.name === "string" &&
        "browser_download_url" in asset &&
        typeof asset.browser_download_url === "string"
    )
  )
}

function unavailable(status = 502): Response {
  return new Response("Android downloads are temporarily unavailable", {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function serveAndroidDownload(
  request: Request,
  githubToken?: string
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Use GET or HEAD for Android downloads", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    })
  }
  const url = new URL(request.url)
  const channel = url.searchParams.get("channel") ?? "stable"
  if (channel !== "stable" && channel !== "beta") {
    return new Response("Invalid Android channel. Use stable or beta", {
      status: 400,
    })
  }
  const format = url.searchParams.get("format")
  if (format !== null && format !== "apk") {
    return new Response("Invalid Android format. Use apk", { status: 400 })
  }
  if (url.searchParams.has("arch")) {
    return new Response(
      "Android APKs support all bundled architectures; omit arch",
      { status: 400 }
    )
  }

  const headers: Record<string, string> = {
    "User-Agent": "Eidos Android download router",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`

  let selected: ReturnType<typeof selectEidosAndroidDownload<AndroidRelease>> =
    null
  try {
    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      // All product releases share this list. Scan pages rather than assuming
      // Android is present among the most recent desktop or CLI releases.
      const response = await fetch(
        `${RELEASES_API}?per_page=100&page=${page}`,
        {
          headers,
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (!response.ok) {
        if (
          response.status === 429 ||
          (response.status === 403 &&
            response.headers.get("x-ratelimit-remaining") === "0")
        ) {
          return unavailable(429)
        }
        return unavailable()
      }
      const body: unknown = await response.json()
      if (!Array.isArray(body) || !body.every(isRelease)) return unavailable()
      selected = selectEidosAndroidDownload(
        selected ? [...body, selected.release] : body,
        channel
      )

      if (/rel="next"/u.test(response.headers.get("Link") ?? "")) continue
      if (!selected) {
        return new Response(`No ${channel} Android APK is available`, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        })
      }
      const location = new URL(selected.asset.browser_download_url)
      if (
        location.origin !== "https://github.com" ||
        !location.pathname.startsWith("/mayneyao/eidos/releases/download/")
      ) {
        return unavailable()
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: location.href,
          "Cache-Control": "public, max-age=60",
        },
      })
    }
    // Do not redirect using a partial version list if pagination is exhausted.
    return unavailable(503)
  } catch {
    return unavailable()
  }
}
