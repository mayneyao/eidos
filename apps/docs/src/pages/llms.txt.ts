import type { APIRoute } from "astro"
import { getCollection } from "astro:content"
import { markdownPathForPage, pagePathForEntry } from "../lib/markdown"

export const GET: APIRoute = async ({ site }) => {
  const entries = (await getCollection("docs", ({ data }) => !data.draft))
    .filter(({ id }) => !/(?:^|\/)404$/.test(id))
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
  const home = entries.find(({ id }) => pagePathForEntry(id) === "/")
  const lines = [
    `# ${home?.data.title || "Eidos Docs"}`,
    "",
    `> ${home?.data.description || ""}`,
    "",
    "Markdown pages are generated from the rendered documentation, including MDX components and code examples. English specifications are normative; Chinese specifications are informative translations.",
    "",
    "- [Eidos products and pricing](https://eidos.space/llms.txt)",
    "",
  ]
  for (const locale of ["en", "zh-cn"]) {
    lines.push(`## ${locale === "en" ? "English" : "简体中文"}`, "")
    for (const entry of entries.filter(
      ({ id }) => id.startsWith("zh-cn/") === (locale === "zh-cn")
    )) {
      const url = new URL(markdownPathForPage(pagePathForEntry(entry.id)), site)
      const title = entry.data.title
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]")
      lines.push(
        `- [${title}](${url})${entry.data.description ? `: ${entry.data.description}` : ""}`
      )
    }
    lines.push("")
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
