/// <reference path="./marked.d.ts" />

import { marked, Renderer } from "marked"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function titleAttribute(title: string | null): string {
  return title ? ` title="${escapeHtml(title)}"` : ""
}

function externalHref(href: string | null): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function imageSource(href: string | null): string | null {
  if (!href) return null
  return /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z\d+/=\s]+$/iu.test(
    href
  )
    ? href
    : null
}

/**
 * A document-local image reference such as `assets/diagram.png`. The Host
 * owns the base URL that maps it to an authorized asset response.
 */
function relativeContentImageHref(href: string | null): string | null {
  if (!href) return null
  const value = href.trim()
  if (
    value !== href ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("?") ||
    value.includes("#") ||
    /^[a-z][a-z\d+.-]*:/iu.test(value)
  ) {
    return null
  }
  return value.split("/").some((segment) => segment === "..") ? null : value
}

function contentImageUrl(href: string | null, baseUrl: string): string | null {
  const relative = relativeContentImageHref(href)
  if (!relative) return null
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return `${base}${encodeURI(relative)}`
}

export interface EidosFileMarkdownRenderOptions {
  /** Host base URL that serves the directory containing the Eidos File. */
  imageBaseUrl?: string
}

/** Render Markdown without admitting arbitrary HTML or unsafe URL schemes. */
export function renderSafeEidosFileMarkdown(
  markdown: string,
  options: EidosFileMarkdownRenderOptions = {}
): string {
  const renderer = new Renderer()
  renderer.html = (html: string) => escapeHtml(html)
  renderer.link = (href: string | null, title: string | null, text: string) => {
    if (href?.startsWith("#")) {
      return `<a href="${escapeHtml(href)}"${titleAttribute(title)}>${text}</a>`
    }
    const external = externalHref(href)
    return external
      ? `<a href="${escapeHtml(external)}" data-eidos-file-markdown-external="true"${titleAttribute(title)}>${text}</a>`
      : text
  }
  renderer.image = (
    href: string | null,
    title: string | null,
    text: string
  ) => {
    const source = imageSource(href)
    if (source) {
      return `<img src="${escapeHtml(source)}" alt="${escapeHtml(text)}" loading="lazy" referrerpolicy="no-referrer"${titleAttribute(title)}>`
    }
    const resolved = options.imageBaseUrl
      ? contentImageUrl(href, options.imageBaseUrl)
      : null
    return resolved
      ? `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text)}" loading="lazy" referrerpolicy="no-referrer"${titleAttribute(title)}>`
      : escapeHtml(text)
  }

  return marked.parse(markdown, {
    gfm: true,
    headerIds: false,
    mangle: false,
    renderer,
  })
}
