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

/** Render Markdown without admitting arbitrary HTML or unsafe URL schemes. */
export function renderSafeEidosFileMarkdown(markdown: string): string {
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
    return source
      ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(text)}" loading="lazy" referrerpolicy="no-referrer"${titleAttribute(title)}>`
      : escapeHtml(text)
  }

  return marked.parse(markdown, {
    gfm: true,
    headerIds: false,
    mangle: false,
    renderer,
  })
}
