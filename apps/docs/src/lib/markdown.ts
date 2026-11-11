import { parse } from "node-html-parser"
import { NodeHtmlMarkdown } from "node-html-markdown"

/** Convert the rendered public page, including FAQ answers and both price periods. */
export function pageMarkdown(html: string, source: string) {
  const document = parse(html, {
    blockTextElements: { script: true, noscript: true, style: true },
  })
  const main = document.querySelector("main")
  if (!main) throw new Error(`Missing public page content: ${source}`)
  const title = document.querySelector("title")?.textContent.trim() || ""
  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") || ""
  const language = document.querySelector("html")?.getAttribute("lang") || "en"
  for (const fallback of main.querySelectorAll("noscript")) {
    fallback.replaceWith(fallback.innerHTML)
  }
  // Keep alternate content panels, but omit inactive controls and empty/error states.
  for (const node of main.querySelectorAll(
    '[hidden]:not([role="tabpanel"]):not([data-cli-panel]):not([data-publish-pane]):not([data-publish-result]):not([data-billing-period])'
  )) {
    node.remove()
  }

  for (const node of main.querySelectorAll(
    'script, style, svg, template, input, select, textarea, [role="dialog"], [aria-hidden="true"], [data-markdown-exclude], .sl-anchor-link, starlight-toc, footer'
  ))
    node.remove()
  for (const button of main.querySelectorAll("button")) {
    if (/^H[1-6]$/.test(button.parentNode?.tagName || ""))
      button.replaceWith(button.innerHTML)
    else button.remove()
  }
  for (const summary of main.querySelectorAll("summary")) {
    summary.replaceWith(`<h3>${summary.innerHTML}</h3>`)
  }
  for (const node of main.querySelectorAll("a[href], img[src]")) {
    const attribute = node.tagName === "A" ? "href" : "src"
    const value = node.getAttribute(attribute)
    if (value && !value.startsWith("data:"))
      node.setAttribute(attribute, new URL(value, source).href)
  }
  for (const pre of main.querySelectorAll("pre")) {
    const code = pre.querySelector("code")
    if (!code) continue
    const lines = code.querySelectorAll(".ec-line")
    const text = lines.length
      ? lines
          .map((line) => (line.querySelector(".code") || line).textContent)
          .join("\n")
      : code.textContent
    const language =
      pre.getAttribute("data-language") ||
      code.getAttribute("class")?.match(/language-([\w-]+)/)?.[1] ||
      ""
    const escaped = text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
    pre.set_content(`<code class="language-${language}">${escaped}</code>`)
  }
  const longestFence = Math.max(
    2,
    ...[...main.textContent.matchAll(/`+/g)].map(([run]) => run.length)
  )
  const converter = new NodeHtmlMarkdown({
    bulletMarker: "-",
    codeBlockStyle: "fenced",
    codeFence: "`".repeat(longestFence + 1),
  })
  // The default cell translator escapes only the first pipe in each cell.
  for (const collection of [
    converter.tableTranslators,
    converter.tableRowTranslators,
  ]) {
    collection.set("th,td", ({ visitor }) => ({
      surroundingNewlines: false,
      childTranslators: visitor.instance.tableCellTranslators,
      prefix: " ",
      postfix: " |",
      postprocess: ({ content }) =>
        content
          .trim()
          .replaceAll("|", "\\|")
          .replace(/(?:\r?\n)+/g, " ")
          .trim(),
    }))
  }
  const body = converter.translate(main.innerHTML)
  return {
    title,
    description,
    language,
    markdown: `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\nsource: ${JSON.stringify(source)}\nlang: ${JSON.stringify(language)}\n---\n\n${body.trim()}\n`,
  }
}

export function pagePathForEntry(id: string): string {
  const path = id.replace(/(?:^|\/)index$/, "").replace(/^\/+|\/+$/g, "")
  return path ? `/${path}/` : "/"
}
export function markdownPathForPage(pathname: string): string {
  const path = pathname.replace(/\/$/, "")
  return !path || path === "/zh-cn" ? `${path}/index.md` : `${path}.md`
}
export function pagePathForMarkdown(pathname: string): string | null {
  if (!pathname.endsWith(".md")) return null
  const path = pathname
    .slice(0, -3)
    .replace(/\/index$/, "")
    .replace(/\/$/, "")
  return path ? `${path}/` : "/"
}
