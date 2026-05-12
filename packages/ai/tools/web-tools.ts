import { Defuddle } from "defuddle/node"
import { parseHTML } from "linkedom"
import { z } from "zod"

const MAX_CONTENT_LENGTH = 30000
const REQUEST_TIMEOUT_MS = 25_000

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ])
}

function truncate(text: string, max: number): string {
  return text.length > max
    ? text.slice(0, max) + "\n\n[Content truncated]"
    : text
}

async function fetchAndExtract(url: string) {
  const res = await withTimeout(
    fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" }),
    REQUEST_TIMEOUT_MS
  )
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase()
  const text = await withTimeout(res.text(), 10_000)

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
      content: truncate(formatted, MAX_CONTENT_LENGTH),
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
      content: truncate(text, MAX_CONTENT_LENGTH),
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
    content: truncate(markdown, MAX_CONTENT_LENGTH),
  }
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

async function exaSearch(
  apiKey: string,
  query: string,
  numResults: number
): Promise<WebSearchItem[]> {
  const res = await withTimeout(
    fetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
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
    }),
    REQUEST_TIMEOUT_MS
  )
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Exa search failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  console.log("⚡ Exa cost:", data.costDollars)
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.highlights ?? [])[0] ?? "",
  }))
}

// ── Tool definitions ────────────────────────────────────────────────────

const searchParams = z.object({
  query: z.string().describe("The search query"),
  num: z.number().optional().describe("Number of results to return (1-10)"),
})

const fetchParams = z.object({
  url: z.string().url().describe("The URL to fetch and extract content from"),
})

export function createWebSearchTool(apiKey?: string) {
  return {
    description:
      "Search the web for information. Returns relevant results with titles, URLs, and snippets.",
    inputSchema: searchParams,
    execute: async (args: unknown) => {
      if (!apiKey) {
        return {
          error:
            "Web search requires an Exa API key. Please configure it in Settings → AI → Tool API Keys.",
        }
      }
      const { query, num } = args as z.infer<typeof searchParams>
      const count = Math.min(num ?? 5, 10)
      console.log("[tool:web-search] ▶", { query, count })
      try {
        const results = await exaSearch(apiKey, query, count)
        console.log("[tool:web-search] ✔", { resultCount: results.length })
        return { results, query } as WebSearchResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:web-search] ✖", msg)
        return { error: `Search failed: ${msg}` }
      }
    },
  }
}

export const webFetchTool = {
  description:
    "Fetch a URL and return its content. HTML pages are cleaned into markdown (ads/nav removed). JSON is returned pretty-printed. XML, plain text, CSV, and JS are returned raw.",

  inputSchema: fetchParams,
  execute: async (args: unknown) => {
    const { url } = args as z.infer<typeof fetchParams>
    console.log("[tool:web-fetch] ▶", { url })
    try {
      const result = await fetchAndExtract(url)
      console.log("[tool:web-fetch] ✔", {
        title: result.title,
        contentLength: result.content.length,
      })
      return result as WebFetchResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[tool:web-fetch] ✖", msg)
      return { error: `Fetch failed: ${msg}` }
    }
  },
}
