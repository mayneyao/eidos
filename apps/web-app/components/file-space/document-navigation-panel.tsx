import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  FileSpaceBacklink,
  FileSpaceMarkdownMetadata,
} from "@eidos.space/file-space"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  LoaderCircle,
  ListTree,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"

import {
  filePathFromSpaceUrl,
  headingFromSpaceUrl,
  toSpaceFileUrl,
} from "./file-path"
import { navigateAfterFlushingSpaceFile } from "./file-navigation"

function isMarkdownPath(filePath: string | null): filePath is string {
  return Boolean(filePath && /\.(?:md|markdown)$/i.test(filePath))
}

function SectionHeader({
  label,
  count,
  open,
  onToggle,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className="flex h-[28px] w-full items-center border-t border-sidebar-border/50 px-1 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/65 outline-hidden hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
      onClick={onToggle}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="px-1 tabular-nums text-sidebar-foreground/40">
        {count}
      </span>
    </button>
  )
}

export function DocumentNavigationPanel({ spaceId }: { spaceId: string }) {
  const { location, navigate } = useRouterAdapter()
  const { getBacklinks, getDocumentMetadata } = useSpaceFiles(spaceId)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [backlinksOpen, setBacklinksOpen] = useState(false)
  const [metadata, setMetadata] = useState<FileSpaceMarkdownMetadata | null>(
    null
  )
  const [backlinks, setBacklinks] = useState<FileSpaceBacklink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const currentUrl = `${location.pathname}${location.search}${location.hash}`
  const filePath = filePathFromSpaceUrl(currentUrl)
  const activeHeading = headingFromSpaceUrl(currentUrl)
  const markdownPath = isMarkdownPath(filePath) ? filePath : null

  const load = useCallback(async () => {
    const request = ++requestRef.current
    if (!markdownPath) {
      setMetadata(null)
      setBacklinks([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [nextMetadata, nextBacklinks] = await Promise.all([
        getDocumentMetadata(markdownPath),
        getBacklinks(markdownPath),
      ])
      if (request !== requestRef.current) return
      setMetadata(nextMetadata)
      setBacklinks(nextBacklinks)
      setError(null)
    } catch (loadError) {
      if (request !== requestRef.current) return
      setMetadata(null)
      setBacklinks([])
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load document navigation"
      )
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [getBacklinks, getDocumentMetadata, markdownPath])

  useEffect(() => {
    void load()
    return () => {
      requestRef.current += 1
    }
  }, [load])

  useSpaceFileChanges(
    spaceId,
    useCallback(() => void load(), [load])
  )

  const headings = metadata?.headings ?? []
  const backlinkCount = useMemo(
    () => backlinks.reduce((count, backlink) => count + backlink.count, 0),
    [backlinks]
  )

  if (!markdownPath) return null

  const openBacklink = async (backlink: FileSpaceBacklink) => {
    setError(null)
    const navigated = await navigateAfterFlushingSpaceFile({
      spaceId,
      currentFilePath: markdownPath,
      destination: toSpaceFileUrl(backlink.sourcePath),
      navigate,
      options: { target: "_blank" },
    })
    if (!navigated) {
      setError("Save the current note before opening this backlink.")
    }
  }

  return (
    <div className="shrink-0 bg-sidebar text-sidebar-foreground">
      <SectionHeader
        label="Outline"
        count={headings.length}
        open={outlineOpen}
        onToggle={() => setOutlineOpen((open) => !open)}
      />
      {outlineOpen ? (
        <div className="max-h-40 overflow-y-auto border-t border-sidebar-border/25 py-0.5">
          {loading && !metadata ? (
            <div className="flex h-12 items-center justify-center text-sidebar-foreground/40">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            </div>
          ) : headings.length === 0 ? (
            <p className="px-5 py-2 text-[11px] text-sidebar-foreground/45">
              No headings in this note
            </p>
          ) : (
            <ul>
              {headings.map((heading) => (
                <li key={`${heading.slug}:${heading.line}`}>
                  <button
                    type="button"
                    className={cn(
                      "flex h-[22px] w-full items-center gap-1.5 pr-2 text-left text-[11px] text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
                      activeHeading === heading.slug &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    style={{ paddingLeft: `${8 + (heading.depth - 1) * 10}px` }}
                    title={`${heading.text} · line ${heading.line}`}
                    onClick={() =>
                      navigate(toSpaceFileUrl(markdownPath, heading.slug), {
                        replace: true,
                      })
                    }
                  >
                    <ListTree className="h-3 w-3 shrink-0 text-sidebar-foreground/40" />
                    <span className="truncate">{heading.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <SectionHeader
        label="Backlinks"
        count={backlinkCount}
        open={backlinksOpen}
        onToggle={() => setBacklinksOpen((open) => !open)}
      />
      {backlinksOpen ? (
        <div className="max-h-40 overflow-y-auto border-t border-sidebar-border/25 py-0.5">
          {loading && backlinks.length === 0 ? (
            <div className="flex h-12 items-center justify-center text-sidebar-foreground/40">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            </div>
          ) : backlinks.length === 0 ? (
            <p className="px-5 py-2 text-[11px] text-sidebar-foreground/45">
              No notes link here
            </p>
          ) : (
            <ul>
              {backlinks.map((backlink) => (
                <li key={backlink.sourcePath}>
                  <button
                    type="button"
                    className="flex min-h-[26px] w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
                    title={
                      backlink.references[0]?.snippet || backlink.sourcePath
                    }
                    onClick={() => void openBacklink(backlink)}
                  >
                    <FileText className="h-3 w-3 shrink-0 text-sidebar-foreground/40" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {backlink.sourceName}
                      </span>
                      <span className="block truncate text-[10px] text-sidebar-foreground/40">
                        {backlink.sourcePath}
                      </span>
                    </span>
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-sm bg-sidebar-accent px-1 text-[9px] tabular-nums text-sidebar-foreground/55">
                      {backlink.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-1.5 border-t border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[10px] leading-4 text-destructive">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}
    </div>
  )
}
