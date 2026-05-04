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

async function fetchAndExtract(url: string) {
  const res = await withTimeout(
    fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" }),
    REQUEST_TIMEOUT_MS
  )
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }
  const html = await withTimeout(res.text(), 10_000)

  const { document } = parseHTML(html)
  const result = await Defuddle(document, url, {
    separateMarkdown: true,
  })

  const markdown: string = result.contentMarkdown ?? result.content ?? ""
  return {
    title: result.title ?? "",
    url,
    content:
      markdown.length > MAX_CONTENT_LENGTH
        ? markdown.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]"
        : markdown,
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
const EXA_API_KEY = "7d8f3234-dcdc-454b-bb93-b865567d8688"

async function exaSearch(
  query: string,
  numResults: number
): Promise<WebSearchItem[]> {
  const res = await withTimeout(
    fetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": EXA_API_KEY,
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

export const webSearchTool = {
  description:
    "Search the web for information. Returns relevant results with titles, URLs, and snippets.",
  inputSchema: searchParams,
  execute: async (args: unknown) => {
    const { query, num } = args as z.infer<typeof searchParams>
    const count = Math.min(num ?? 5, 10)
    console.log("[tool:webSearch] ▶", { query, count })
    try {
      const results = await exaSearch(query, count)
      console.log("[tool:webSearch] ✔", { resultCount: results.length })
      return { results, query } as WebSearchResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[tool:webSearch] ✖", msg)
      return { error: `Search failed: ${msg}` }
    }
  },
}

export const webFetchTool = {
  description:
    "Fetch a web page and extract its main content as clean markdown. Removes ads, navigation, and other boilerplate.",
  inputSchema: fetchParams,
  execute: async (args: unknown) => {
    const { url } = args as z.infer<typeof fetchParams>
    console.log("[tool:webFetch] ▶", { url })
    try {
      const result = await fetchAndExtract(url)
      console.log("[tool:webFetch] ✔", {
        title: result.title,
        contentLength: result.content.length,
      })
      return result as WebFetchResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[tool:webFetch] ✖", msg)
      return { error: `Fetch failed: ${msg}` }
    }
  },
}
