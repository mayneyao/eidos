import type { Bash } from "@eidos.space/bashkit"
import type { Tool } from "ai"
import { Defuddle } from "defuddle/node"
import { parseHTML } from "linkedom"
import { z } from "zod"

const MAX_CONTENT_LENGTH = 30000
const REQUEST_TIMEOUT_MS = 25_000
const MAX_REDIRECTS = 5

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  try {
    return await operation(controller.signal)
  } catch (error) {
    if (externalSignal?.aborted) throw new Error("Web request was canceled")
    if (timedOut) {
      throw new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener("abort", abortFromCaller)
  }
}

function truncate(text: string, max: number): string {
  return text.length > max
    ? text.slice(0, max) + "\n\n[Content truncated]"
    : text
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return false
  }
  const octets = parts.map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return true
  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function assertPublicHttpUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Web fetch supports only HTTP and HTTPS URLs")
  }
  if (parsed.username || parsed.password) {
    throw new Error("Web fetch URLs cannot contain credentials")
  }
  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
  const privateIpv6 =
    hostname.includes(":") &&
    (hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith("::ffff:"))
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname) ||
    privateIpv6
  ) {
    throw new Error(
      "Web fetch cannot access local or private network addresses"
    )
  }
  return parsed
}

async function fetchAndExtract(
  rawUrl: string,
  externalSignal?: AbortSignal
): Promise<WebFetchResult> {
  return withRequestDeadline(async (signal) => {
    let currentUrl = assertPublicHttpUrl(rawUrl)
    let res: Response | undefined
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      res = await fetch(currentUrl, {
        headers: BROWSER_HEADERS,
        redirect: "manual",
        signal,
      })
      if (![301, 302, 303, 307, 308].includes(res.status)) break
      const location = res.headers.get("location")
      if (!location) {
        throw new Error(
          `Fetch redirect ${res.status} did not include a location`
        )
      }
      if (redirects === MAX_REDIRECTS) {
        throw new Error(`Fetch exceeded ${MAX_REDIRECTS} redirects`)
      }
      currentUrl = assertPublicHttpUrl(new URL(location, currentUrl).toString())
    }
    if (!res?.ok) {
      throw new Error(
        `Fetch failed: ${res?.status ?? "unknown"} ${res?.statusText ?? ""}`.trim()
      )
    }

    const url = currentUrl.toString()
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase()
    const text = await res.text()

    // JSON → return raw (pretty-printed)
    if (
      contentType.includes("application/json") ||
      contentType.includes("+json")
    ) {
      let formatted: string
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        formatted = text
      }
      return {
        title: "",
        url,
        content: formatted,
      }
    }

    // XML / plain text / other non-HTML → return raw
    if (
      contentType.includes("application/xml") ||
      contentType.includes("text/xml") ||
      contentType.includes("text/plain") ||
      contentType.includes("text/csv") ||
      contentType.includes("text/javascript") ||
      contentType.includes("application/javascript")
    ) {
      return {
        title: "",
        url,
        content: text,
      }
    }

    // HTML → extract content via Defuddle
    const { document } = parseHTML(text)
    const result = await Defuddle(document, url, {
      separateMarkdown: true,
    })

    const markdown: string = result.contentMarkdown ?? result.content ?? ""
    return {
      title: result.title ?? "",
      url,
      content: markdown,
    }
  }, externalSignal)
}

export interface WebSearchItem {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResult {
  results: WebSearchItem[]
  query: string
}

export interface WebFetchResult {
  title: string
  url: string
  content: string
}

// ── Exa search ──────────────────────────────────────────────────────────

const EXA_API_URL = "https://api.exa.ai/search"

export interface WebSearchOptions {
  apiKey: string
  numResults?: number
  signal?: AbortSignal
}

export interface WebFetchOptions {
  maxContentLength?: number | null
  signal?: AbortSignal
}

export async function searchWeb(
  query: string,
  options: WebSearchOptions
): Promise<WebSearchResult> {
  const numResults = Math.max(1, Math.min(options.numResults ?? 5, 10))
  const results = await withRequestDeadline(async (signal) => {
    const res = await fetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults,
        contents: {
          highlights: true,
        },
      }),
      signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Exa search failed: ${res.status} ${body}`)
    }
    const data = (await res.json()) as {
      costDollars?: unknown
      results?: Array<{
        title?: unknown
        url?: unknown
        highlights?: unknown
      }>
    }
    console.log("[tool:web-search] Exa cost:", data.costDollars)
    return (data.results ?? []).map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      url: typeof item.url === "string" ? item.url : "",
      snippet:
        Array.isArray(item.highlights) && typeof item.highlights[0] === "string"
          ? item.highlights[0]
          : "",
    }))
  }, options.signal)
  return { results, query }
}

export async function fetchWeb(
  url: string,
  options: WebFetchOptions = {}
): Promise<WebFetchResult> {
  const result = await fetchAndExtract(url, options.signal)
  return {
    ...result,
    content:
      options.maxContentLength === null
        ? result.content
        : truncate(
            result.content,
            options.maxContentLength ?? MAX_CONTENT_LENGTH
          ),
  }
}

// ── Tool factories ──────────────────────────────────────────────────────

const searchParams = z.object({
  query: z.string().describe("The search query"),
  num: z
    .number()
    .optional()
    .describe("Number of results to return (1-10, default 5)"),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Optional: Save results to VFS path for multi-step processing. " +
        "Skip this for simple queries — results are returned directly."
    ),
})

const fetchParams = z.object({
  url: z.string().url().describe("The URL to fetch and extract content from"),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Optional: Save content to VFS path for multi-step processing. " +
        "Skip this for simple reading — content is returned directly."
    ),
})

export function createWebSearchTools(
  bash: Bash,
  apiKey?: string
): Record<string, Tool> {
  const tool: Tool = {
    description:
      "Search the web for information using Exa. Returns relevant results with titles, URLs, and snippets directly. " +
      "Results are immediately available for analysis — no need to save to file first. " +
      "Only use `outputPath` when you need to persist data for multi-step processing (e.g., merging multiple searches, editing content later).",
    inputSchema: searchParams,
    execute: async (args: unknown) => {
      if (!apiKey) {
        return {
          error:
            "Web search requires an Exa API key. Please configure it in Settings → AI → Tool API Keys.",
        }
      }
      const { query, num, outputPath } = args as z.infer<typeof searchParams>
      const count = Math.min(num ?? 5, 10)
      console.log("[tool:web-search] ▶", { query, count, outputPath })
      try {
        const resultData = await searchWeb(query, {
          apiKey,
          numResults: count,
        })

        if (outputPath) {
          bash.writeFile(outputPath, JSON.stringify(resultData, null, 2))
          console.log("[tool:web-search] ✔ saved to", outputPath)
          return {
            ...resultData,
            savedTo: outputPath,
          }
        }

        console.log("[tool:web-search] ✔", {
          resultCount: resultData.results.length,
        })
        return resultData
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:web-search] ✖", msg)
        return { error: `Search failed: ${msg}` }
      }
    },
  }

  return { "web-search": tool }
}

export function createWebFetchTools(bash: Bash): Record<string, Tool> {
  const tool: Tool = {
    description:
      "Fetch a URL and return its content. HTML pages are cleaned into markdown (ads/nav removed). " +
      "JSON is pretty-printed. XML, plain text, CSV, and JS are returned raw. " +
      "Content is immediately available for reading and analysis — no need to save to file first. " +
      "Only use `outputPath` when you need to persist content for multi-step processing (e.g., editing, combining multiple pages).",
    inputSchema: fetchParams,
    execute: async (args: unknown) => {
      const { url, outputPath } = args as z.infer<typeof fetchParams>
      console.log("[tool:web-fetch] ▶", { url, outputPath })
      try {
        const result = await fetchWeb(url, {
          maxContentLength: outputPath ? null : undefined,
        })

        if (outputPath) {
          bash.writeFile(outputPath, result.content)
          console.log("[tool:web-fetch] ✔ saved to", outputPath)
          return {
            title: result.title,
            url: result.url,
            savedTo: outputPath,
          }
        }

        console.log("[tool:web-fetch] ✔", {
          title: result.title,
          contentLength: result.content.length,
        })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:web-fetch] ✖", msg)
        return { error: `Fetch failed: ${msg}` }
      }
    },
  }

  return { "web-fetch": tool }
}
