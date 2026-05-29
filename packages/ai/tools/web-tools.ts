import type { Bash } from "@eidos.space/bashkit"
import type { Tool } from "ai"
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
  console.log("[tool:web-search] Exa cost:", data.costDollars)
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.highlights ?? [])[0] ?? "",
  }))
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
        const results = await exaSearch(apiKey, query, count)
        const resultData: WebSearchResult = { results, query }

        if (outputPath) {
          bash.writeFile(outputPath, JSON.stringify(resultData, null, 2))
          console.log("[tool:web-search] ✔ saved to", outputPath)
          return {
            ...resultData,
            savedTo: outputPath,
          }
        }

        console.log("[tool:web-search] ✔", { resultCount: results.length })
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
        const result = await fetchAndExtract(url)

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
        return result as WebFetchResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:web-fetch] ✖", msg)
        return { error: `Fetch failed: ${msg}` }
      }
    },
  }

  return { "web-fetch": tool }
}
