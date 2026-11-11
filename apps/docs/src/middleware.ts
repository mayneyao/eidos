import { defineMiddleware } from "astro:middleware"
import { getCollection } from "astro:content"
import {
  pagePathForEntry,
  pagePathForMarkdown,
  pageMarkdown,
} from "./lib/markdown"

// Production serves the generated static files. Use the same converter in dev.
export const onRequest = defineMiddleware(async (context, next) => {
  const sourcePath = pagePathForMarkdown(context.url.pathname)
  if (!sourcePath) return next()
  const entries = await getCollection("docs", ({ data }) => !data.draft)
  if (!entries.some(({ id }) => pagePathForEntry(id) === sourcePath)) {
    return new Response("Not Found", { status: 404 })
  }
  if (!["GET", "HEAD"].includes(context.request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    })
  }
  const isHead = context.request.method === "HEAD"
  const target = new URL(sourcePath, context.url)
  target.search = ""
  const response = await next(
    new Request(target, { headers: { Accept: "text/html" } })
  )
  if (!response.ok) return response
  const source = new URL(sourcePath, context.site).href
  const page = pageMarkdown(await response.text(), source)
  return new Response(isHead ? null : page.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${source}>; rel="canonical"`,
    },
  })
})
