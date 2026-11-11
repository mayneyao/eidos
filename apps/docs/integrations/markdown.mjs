import { readFile, mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { markdownPathForPage, pageMarkdown } from "../src/lib/markdown.ts"

export default function markdownPages() {
  let site
  return {
    name: "eidos-markdown-pages",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site
      },
      "astro:build:done": async ({ dir, pages, logger }) => {
        const output = fileURLToPath(dir)
        let count = 0
        for (const { pathname } of pages) {
          const route = `/${pathname}`.replace(/\/{2,}/g, "/")
          if (/\.[^/]+$/.test(route) || /(?:^|\/)404\/?$/.test(route)) continue
          const htmlPath = path.join(
            output,
            route.replace(/^\//, ""),
            "index.html"
          )
          const html = await readFile(htmlPath, "utf8")
          if (/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html))
            continue
          const page = pageMarkdown(html, new URL(route, site).href)
          const target = path.join(output, markdownPathForPage(route).slice(1))
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, page.markdown)
          count++
        }
        logger.info(
          `Generated ${count} Markdown pages from rendered documentation.`
        )
      },
    },
  }
}
