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
  const body = NodeHtmlMarkdown.translate(main.innerHTML, {
    bulletMarker: "-",
    codeBlockStyle: "fenced",
    codeFence: "`".repeat(longestFence + 1),
  })
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
