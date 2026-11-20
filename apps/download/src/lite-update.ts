import {
  findReleaseAsset,
  getEidosLiteUpdateRoute,
  isPublishedLiteUpdateRelease,
  selectEidosLiteRelease,
} from "./release-routing.mjs"

export interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: Array<{ name: string; label?: string; browser_download_url: string }>
}

export const LITE_RELEASES_API =
  "https://api.github.com/repos/mayneyao/eidos/releases"
const MAX_RELEASE_PAGES = 10

function unavailable(status = 502): Response {
  return new Response("Eidos Lite updates are temporarily unavailable", {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function serveLiteUpdate(
  request: Request,
  getGitHubToken: () => Promise<string> | undefined
): Promise<Response> {
  const route = getEidosLiteUpdateRoute(new URL(request.url).pathname)
  if (!route) return missingAsset()
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Use GET or HEAD for Eidos Lite updates", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    })
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Eidos Lite update router",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }
    const githubToken = await getGitHubToken()
    if (githubToken) headers.Authorization = `Bearer ${githubToken}`
    // Keep the API credential on api.github.com. Only send the client the
    // public asset URL, so its original Range header follows the redirect.
    const requestOptions = {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    } as const
    let selected: GitHubRelease | null = null

    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      const response = await fetch(
        route.releaseTag
          ? `${LITE_RELEASES_API}/tags/${route.releaseTag}`
          : `${LITE_RELEASES_API}?per_page=100&page=${page}`,
        requestOptions
      )
      if (route.releaseTag && response.status === 404) return missingAsset()
      if (!response.ok) {
        const rateLimited =
          response.status === 429 ||
          (response.status === 403 &&
            response.headers.get("x-ratelimit-remaining") === "0")
        return unavailable(rateLimited ? 429 : 502)
      }
      if (route.releaseTag) {
        const release = (await response.json()) as GitHubRelease
        if (isPublishedLiteUpdateRelease(release, route.releaseTag)) {
          selected = release
        }
        break
      }

      // All product releases share the list. Keep the highest eligible
      // version across pages, including when the newest release lacks YAML.
      const releases = (await response.json()) as GitHubRelease[]
      const eligible = releases.filter((release) =>
        findReleaseAsset(release.assets, route.assetName)
      )
      if (selected) eligible.push(selected)
      selected = selectEidosLiteRelease(eligible, route.channel)
      if (!/rel="next"/u.test(response.headers.get("Link") ?? "")) break
      if (page === MAX_RELEASE_PAGES) return unavailable(503)
    }

    if (!selected) return missingAsset()
    const asset = findReleaseAsset(selected.assets, route.assetName)
    if (!asset) return missingAsset()
    const location = new URL(asset.browser_download_url)
    if (
      location.origin !== "https://github.com" ||
      location.pathname !==
        `/mayneyao/eidos/releases/download/${selected.tag_name}/${encodeURIComponent(asset.name)}`
    ) {
      return unavailable()
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: location.href,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return unavailable()
  }
}

function missingAsset(): Response {
  return new Response("Eidos Lite update asset is unavailable", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}
