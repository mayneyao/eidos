import { useEffect, useMemo, useRef } from "react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { renderSafeEidosFileMarkdown } from "./eidos-file-markdown"

/**
 * Shared typographic scale for the fallback Markdown renderer. Hosts that
 * supply `renderMarkdownHtml` provide their own wrapper class instead, so the
 * preview matches the Host editor's syntax and highlighting.
 */
export const EIDOS_FILE_MARKDOWN_PROSE_CLASS =
  "max-w-none break-words text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_hr]:my-9 [&_hr]:border-border [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-sm [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-6 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_td]:border-b [&_td]:px-2 [&_td]:py-2 [&_th]:border-b [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0"

/** Relative document-local sources need Host resolution; absolute URLs do not. */
function isResolvableMarkdownImage(source: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(source)
}

export function EidosFileMarkdownPreview({
  markdown,
  className,
  onDoubleClick,
  onError,
}: {
  markdown: string
  className?: string
  onDoubleClick?: () => void
  onError?: (error: unknown) => void
}) {
  const {
    activateUrl,
    contentImageBaseUrl,
    renderMarkdownHtml,
    resolveMarkdownImageUrl,
  } = useEidosFileUI()
  const surfaceRef = useRef<HTMLDivElement>(null)

  const rendered = useMemo(
    () =>
      renderMarkdownHtml
        ? renderMarkdownHtml(markdown, { imageBaseUrl: contentImageBaseUrl })
        : {
            html: renderSafeEidosFileMarkdown(markdown, {
              imageBaseUrl: contentImageBaseUrl,
            }),
            className: EIDOS_FILE_MARKDOWN_PROSE_CLASS,
          },
    [contentImageBaseUrl, markdown, renderMarkdownHtml]
  )

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !resolveMarkdownImageUrl) return
    let cancelled = false
    const sources = new Set<string>()
    for (const image of surface.querySelectorAll<HTMLImageElement>(
      "img[src]"
    )) {
      const source = image.getAttribute("src")
      if (source && isResolvableMarkdownImage(source)) sources.add(source)
    }
    if (sources.size === 0) return
    void Promise.all(
      [...sources].map(async (source) => {
        const resolved = await resolveMarkdownImageUrl(source).catch(() => null)
        return [source, resolved] as const
      })
    ).then((resolutions) => {
      if (cancelled) return
      for (const [source, resolved] of resolutions) {
        if (!resolved) continue
        for (const image of surface.querySelectorAll<HTMLImageElement>(
          "img[src]"
        )) {
          if (image.getAttribute("src") === source) {
            image.setAttribute("src", resolved)
          }
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [rendered.html, resolveMarkdownImageUrl])

  return (
    <div
      ref={surfaceRef}
      className={cn(rendered.className, className)}
      data-eidos-file-markdown-preview=""
      dangerouslySetInnerHTML={{ __html: rendered.html }}
      onDoubleClick={onDoubleClick}
      onClick={(event) => {
        const target = event.target as Element
        const link = target.closest<HTMLAnchorElement>("a[href]")
        const href = link?.getAttribute("href")
        if (!href || href.startsWith("#")) return
        event.preventDefault()
        if (!activateUrl) return
        try {
          void Promise.resolve(activateUrl(href)).catch(onError)
        } catch (error) {
          onError?.(error)
        }
      }}
    />
  )
}
