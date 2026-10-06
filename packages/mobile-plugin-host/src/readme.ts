import { mobileText } from "./locale"
import { renderMarkdownToHtml } from "../../markdown/src/static"
import "../../markdown/src/static.css"
import type { NativeRequest } from "./host"

export type PluginReadme = {
  markdown: string
  baseUrl: string
  cached?: boolean
}

export function renderPluginReadme(value: PluginReadme): HTMLElement {
  const article = document.createElement("article")
  article.className = "plugin-readme eme-static"
  // The shared renderer sanitizes raw HTML before it reaches the WebView.
  article.innerHTML = renderMarkdownToHtml(value.markdown)
  for (const node of article.querySelectorAll<
    HTMLAnchorElement | HTMLImageElement
  >("a[href], img[src]")) {
    const attribute = node instanceof HTMLImageElement ? "src" : "href"
    const raw = node.getAttribute(attribute) ?? ""
    if (raw.startsWith("#")) continue
    try {
      const url = new URL(raw, value.baseUrl)
      if (!["https:", "http:"].includes(url.protocol)) {
        node.removeAttribute(attribute)
        continue
      }
      if (
        node instanceof HTMLAnchorElement &&
        !/^(?:[a-z]+:|\/\/)/i.test(raw)
      ) {
        url.hostname = "github.com"
        url.pathname = url.pathname.replace(
          /^\/([^/]+\/[^/]+)\/([^/]+)\//,
          "/$1/blob/$2/"
        )
      }
      node.setAttribute(attribute, url.href)
      if (node instanceof HTMLImageElement) {
        node.loading = "lazy"
        node.referrerPolicy = "no-referrer"
      }
    } catch {
      node.removeAttribute(attribute)
    }
  }
  return article
}

export async function showPluginReadme(
  root: HTMLElement,
  native: NativeRequest,
  id: string
) {
  root.classList.add("plugin-readme-page")
  const load = async () => {
    const status = document.createElement("p")
    status.setAttribute("role", "status")
    status.textContent = mobileText("正在加载说明…")
    root.replaceChildren(status)
    try {
      const value = await native<PluginReadme | null>("readme", { id })
      if (!value) {
        status.textContent = mobileText("此插件暂未提供 README。")
        return
      }
      root.replaceChildren(renderPluginReadme(value))
      if (value.cached) {
        status.textContent = mobileText("当前显示已缓存的说明。")
        root.prepend(status)
      }
    } catch {
      status.textContent = mobileText("说明加载失败，请检查网络后重试。")
      const retry = document.createElement("button")
      retry.textContent = mobileText("重试")
      retry.onclick = () => {
        void load()
      }
      root.append(retry)
    }
  }
  root.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]")
    if (!link || link.getAttribute("href")?.startsWith("#")) return
    event.preventDefault()
    void native("readme.openLink", { url: link.href }).catch(() => {})
  })
  await load()
}
