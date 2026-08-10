import {
  findReleaseAsset,
  getCliSource,
  getEidosLiteUpdateRoute,
  releaseAssetNameForLiteUpdate,
  selectEidosLiteRelease,
} from "./release-routing.mjs"

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;

  // GitHub personal access token for API requests
  GITHUB_TOKEN?: SecretsStoreSecret
}

interface GitHubAsset {
  name: string
  label?: string
  browser_download_url: string
}

interface GitHubRelease {
  assets: GitHubAsset[]
  draft: boolean
  prerelease: boolean
  tag_name: string
}

async function serveCliFile(sourceUrl: string, pathname: string) {
  try {
    const upstream = await fetch(sourceUrl, {
      headers: { "User-Agent": "Eidos CLI installer proxy" },
    })
    if (!upstream.ok) {
      return new Response("CLI installer is temporarily unavailable", {
        status: 502,
      })
    }

    return new Response(upstream.body, {
      headers: {
        "Cache-Control":
          pathname === "/cli/latest"
            ? "public, max-age=60"
            : "public, max-age=300",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("CLI installer is temporarily unavailable", {
      status: 502,
    })
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)
    const cliSource = getCliSource(url.pathname)
    if (cliSource) {
      return serveCliFile(cliSource, url.pathname)
    }

    const liteUpdateRoute = getEidosLiteUpdateRoute(url.pathname)

    const platform = url.pathname.split("/").pop()?.toLowerCase()
    const arch = url.searchParams.get("arch")?.toLowerCase()

    if (
      !liteUpdateRoute &&
      platform !== "mac" &&
      platform !== "win" &&
      platform !== "linux"
    ) {
      return new Response("Invalid platform. Use /mac or /win or /linux", {
        status: 400,
      })
    }

    const baseUrl = "https://api.github.com/repos"

    const owner = "mayneyao"
    const repo = "eidos"

    const apiUrl = `${baseUrl}/${owner}/${repo}/releases`

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Cloudflare Worker GitHub Release Checker",
        Accept: "application/vnd.github.v3+json",
      }

      const apiKey = await env.GITHUB_TOKEN?.get()
      // Add GitHub token if available
      if (apiKey) {
        headers["Authorization"] = `token ${apiKey}`
      }

      const response = await fetch(apiUrl, { headers })

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get(
            "x-ratelimit-remaining"
          )
          const rateLimitReset = response.headers.get("x-ratelimit-reset")

          if (rateLimitRemaining === "0") {
            const resetTime = rateLimitReset
              ? new Date(parseInt(rateLimitReset) * 1000)
              : "unknown"
            return new Response(
              `Rate limit exceeded. Resets at: ${resetTime}. Consider adding a GitHub token for higher limits.`,
              { status: 429 }
            )
          }

          return new Response(
            `GitHub API access forbidden (403). This might be due to rate limiting or IP restrictions. Consider adding a GitHub token.`,
            { status: 403 }
          )
        }

        throw new Error(
          `GitHub API responded with ${response.status} ${response.statusText}`
        )
      }

      const releases = (await response.json()) as GitHubRelease[]
      if (liteUpdateRoute) {
        const release = selectEidosLiteRelease(
          releases,
          liteUpdateRoute.channel
        )
        if (!release) {
          return new Response("No Eidos Lite update is available", {
            status: 404,
          })
        }
        const assetName = releaseAssetNameForLiteUpdate(liteUpdateRoute)
        const asset = findReleaseAsset(release.assets, assetName) as
          | GitHubAsset
          | undefined
        if (!asset) {
          return new Response("Eidos Lite update asset is unavailable", {
            status: 404,
          })
        }
        return Response.redirect(asset.browser_download_url, 302)
      }

      const latestRelease = selectEidosLiteRelease(releases, "stable")
      if (!latestRelease) {
        return new Response("No stable Eidos Lite release found", {
          status: 404,
        })
      }
      const extMap = {
        mac: ".dmg",
        win: ".exe",
        linux: ".AppImage".toLowerCase(),
      }

      const asset = latestRelease.assets.find((asset: GitHubAsset) => {
        const name = asset.name.toLowerCase()
        const ext = extMap[platform as keyof typeof extMap]
        if (arch) {
          return name.includes(arch) && name.endsWith(ext)
        }
        return name.endsWith(ext)
      })

      if (!asset) {
        return new Response(`No ${platform} release found`, { status: 404 })
      }

      return Response.redirect(asset.browser_download_url, 302)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      return new Response(`Error: ${errorMessage}`, { status: 500 })
    }
  },
}
