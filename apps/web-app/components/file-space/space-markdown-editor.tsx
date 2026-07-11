import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import {
  MarkdownEditor,
  type MarkdownImageUpload,
  type MarkdownLinkActivation,
  type MarkdownRenderingOptions,
} from "@eidos.space/markdown-editor"
import { uniqueSpaceEntryName } from "@eidos.space/file-space"
import { markdownHeadingSlug } from "@eidos.space/file-space/markdown"
import { ImageOff } from "lucide-react"

import {
  headingFromSpaceLink,
  parentSpacePath,
  resolveSpaceLink,
  toSpaceAssetUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useToast } from "@/components/ui/use-toast"

import "@eidos.space/markdown-editor/styles.css"

export interface SpaceMarkdownEditorProps {
  filePath: string
  heading?: string
  value: string
  onChange: (markdown: string) => void
  onBlur?: () => void
  onSave?: () => void
  readOnly?: boolean
}

const EXTERNAL_LINK = /^(?:https?:|mailto:|tel:)/i
const ATTACHMENT_DIRECTORY = "assets"

function relativeSpacePath(fromDirectory: string, targetPath: string): string {
  const from = fromDirectory.split("/").filter(Boolean)
  const target = targetPath.split("/").filter(Boolean)
  let shared = 0
  while (shared < from.length && from[shared] === target[shared]) shared += 1
  return [
    ...Array.from({ length: from.length - shared }, () => ".."),
    ...target.slice(shared),
  ].join("/")
}

function attachmentName(file: File, index: number): string {
  const fallbackExtension = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "")
  const fallback = `pasted-image-${Date.now()}-${index + 1}${fallbackExtension ? `.${fallbackExtension}` : ".png"}`
  const clean = file.name.split(/[\\/]/).pop()?.replace(/[\0:]/g, "-").trim()
  return clean || fallback
}

/**
 * File-Space host adapter for the standalone Markdown editor. The package
 * owns Markdown/Lexical semantics; this component owns Space navigation and
 * asset resolution.
 */
export function SpaceMarkdownEditor({
  filePath,
  heading,
  value,
  onChange,
  onBlur,
  onSave,
  readOnly = false,
}: SpaceMarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { currentSpace } = useCurrentSpace()
  const { createBinary, createDirectory, list, resolveLink } = useSpaceFiles(
    currentSpace?.id
  )
  const { navigate } = useRouterAdapter()
  const { toast } = useToast()

  const activateLink = useCallback(
    async (link: MarkdownLinkActivation, event: MouseEvent<HTMLElement>) => {
      event.preventDefault()

      // In the editable surface a plain click places the caret. Command/Ctrl
      // click follows the link, matching desktop editor conventions.
      if (!readOnly && !event.metaKey && !event.ctrlKey) return

      const rawTarget = link.target ?? link.href
      if (EXTERNAL_LINK.test(rawTarget)) {
        window.open(rawTarget, "_blank", "noopener,noreferrer")
        return
      }

      const fallbackPath = resolveSpaceLink(filePath, rawTarget)
      if (!fallbackPath) {
        toast({
          title: "Link target not found",
          description:
            "This link does not point to a file in the current Space.",
          variant: "destructive",
        })
        return
      }

      let linkedPath = fallbackPath
      let fragment = headingFromSpaceLink(rawTarget)
      let ambiguous = false
      try {
        const resolved = await resolveLink(filePath, rawTarget)
        linkedPath = resolved.path ?? fallbackPath
        fragment = resolved.fragment ?? fragment
        ambiguous = resolved.ambiguous
      } catch {
        // The deterministic relative-path fallback still provides useful
        // offline navigation if the file index is temporarily unavailable.
      }

      const navigated = await navigateAfterFlushingSpaceFile({
        spaceId: currentSpace?.id,
        currentFilePath: filePath,
        destination: toSpaceFileUrl(linkedPath, fragment),
        navigate,
      })
      if (!navigated) {
        toast({
          title: "Unable to open link",
          description:
            "Eidos could not save the current file. Resolve the error and try again.",
          variant: "destructive",
        })
      } else if (ambiguous) {
        toast({
          title: "Opened the nearest match",
          description: "Multiple files in this Space match that link.",
        })
      }
    },
    [currentSpace?.id, filePath, navigate, readOnly, resolveLink, toast]
  )

  const rendering = useMemo<MarkdownRenderingOptions>(
    () => ({
      resolveWikiLink: (target) => {
        const linkedPath = resolveSpaceLink(filePath, target)
        return linkedPath
          ? toSpaceFileUrl(linkedPath, headingFromSpaceLink(target))
          : target
      },
      renderImage: (image) =>
        EXTERNAL_LINK.test(image.src) ||
        image.src.startsWith("data:") ||
        !resolveSpaceLink(filePath, image.target ?? image.src) ? (
          <img
            alt={image.alt}
            className="my-5 max-h-[70vh] rounded-sm object-contain"
            src={image.resolvedSrc}
            title={image.title}
          />
        ) : (
          <SpaceMarkdownImage
            alt={image.alt}
            currentFilePath={filePath}
            target={image.target ?? image.src}
            title={image.title}
          />
        ),
      onLinkActivate: (link, event) => {
        void activateLink(link, event)
      },
    }),
    [activateLink, filePath]
  )

  const uploadImages = useCallback(
    async (files: readonly File[]): Promise<readonly MarkdownImageUpload[]> => {
      let existingNames: string[]
      try {
        existingNames = (await list(ATTACHMENT_DIRECTORY)).map(
          (entry) => entry.name
        )
      } catch {
        await createDirectory(ATTACHMENT_DIRECTORY)
        existingNames = []
      }

      const uploads: MarkdownImageUpload[] = []
      for (const [index, file] of files.entries()) {
        const name = uniqueSpaceEntryName(
          existingNames,
          attachmentName(file, index)
        )
        existingNames.push(name)
        const assetPath = `${ATTACHMENT_DIRECTORY}/${name}`
        await createBinary(assetPath, new Uint8Array(await file.arrayBuffer()))
        uploads.push({
          alt: file.name || name,
          src: relativeSpacePath(parentSpacePath(filePath), assetPath),
        })
      }
      return uploads
    },
    [createBinary, createDirectory, filePath, list]
  )

  useEffect(() => {
    if (!heading || !containerRef.current) return
    const expectedSlug = markdownHeadingSlug(heading)
    const timer = window.setTimeout(() => {
      const headings = containerRef.current?.querySelectorAll(
        "h1, h2, h3, h4, h5, h6"
      )
      const target = [...(headings ?? [])].find(
        (candidate) =>
          markdownHeadingSlug(candidate.textContent ?? "") === expectedSlug
      )
      target?.scrollIntoView({ block: "start" })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [heading, value])

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-background"
      onKeyDownCapture={(event) => {
        if (
          !readOnly &&
          event.key.toLowerCase() === "s" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          onSave?.()
        }
      }}
    >
      <MarkdownEditor
        ariaLabel={filePath}
        className="mx-auto min-h-full max-w-3xl px-8 py-10"
        contentClassName="min-h-[calc(100vh-8rem)]"
        onBlur={() => onBlur?.()}
        onChange={onChange}
        onImageUploadError={(error) => {
          toast({
            title: "Unable to add image",
            description: error.message,
            variant: "destructive",
          })
        }}
        readOnly={readOnly}
        rendering={rendering}
        uploadImages={readOnly ? undefined : uploadImages}
        value={value}
      />
    </div>
  )
}

function SpaceMarkdownImage({
  currentFilePath,
  target,
  alt,
  title,
}: {
  currentFilePath: string
  target: string
  alt: string
  title?: string
}) {
  const { path: filePath, loading } = useResolvedSpaceLink(
    currentFilePath,
    target
  )
  if (loading || !filePath) {
    return <span className="text-sm text-muted-foreground">Loading image…</span>
  }
  return (
    <ResolvedSpaceMarkdownImage filePath={filePath} alt={alt} title={title} />
  )
}

function ResolvedSpaceMarkdownImage({
  filePath,
  alt,
  title,
}: {
  filePath: string
  alt: string
  title?: string
}) {
  const { error, url } = useSpaceAssetUrl(filePath)

  if (error) {
    return (
      <span className="my-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        {alt || filenameOf(filePath)}
      </span>
    )
  }
  if (!url) {
    return <span className="text-sm text-muted-foreground">Loading image…</span>
  }
  return (
    <img
      src={url}
      alt={alt}
      title={title}
      className="my-5 max-h-[70vh] rounded-sm object-contain"
    />
  )
}

function useResolvedSpaceLink(currentFilePath: string, target: string) {
  const { currentSpace } = useCurrentSpace()
  const { resolveLink } = useSpaceFiles(currentSpace?.id)
  const fallbackPath = useMemo(
    () => resolveSpaceLink(currentFilePath, target),
    [currentFilePath, target]
  )
  const fallbackFragment = useMemo(() => headingFromSpaceLink(target), [target])
  const resolutionKey = `${currentFilePath}\0${target}`
  const [resolution, setResolution] = useState<{
    key: string
    path: string | null
    fragment?: string
  } | null>(null)

  useEffect(() => {
    if (!fallbackPath) {
      setResolution({ key: resolutionKey, path: null })
      return
    }
    let active = true
    void resolveLink(currentFilePath, target)
      .then((resolved) => {
        if (!active) return
        setResolution({
          key: resolutionKey,
          path: resolved.path ?? fallbackPath,
          fragment: resolved.fragment ?? fallbackFragment,
        })
      })
      .catch(() => {
        if (!active) return
        setResolution({
          key: resolutionKey,
          path: fallbackPath,
          fragment: fallbackFragment,
        })
      })
    return () => {
      active = false
    }
  }, [
    currentFilePath,
    fallbackFragment,
    fallbackPath,
    resolutionKey,
    resolveLink,
    target,
  ])

  const currentResolution =
    resolution?.key === resolutionKey ? resolution : null
  return {
    path: currentResolution?.path ?? fallbackPath,
    fragment: currentResolution?.fragment ?? fallbackFragment,
    loading: Boolean(fallbackPath && !currentResolution),
  }
}

function useSpaceAssetUrl(filePath: string) {
  const { currentSpace } = useCurrentSpace()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const loadVersionRef = useRef(0)

  const load = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current
    const assetUrl = toSpaceAssetUrl(filePath, revision)
    setUrl(null)
    setError(null)
    try {
      const response = await fetch(assetUrl, {
        method: "HEAD",
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Unable to preview file (${response.status})`)
      }
      if (loadVersion !== loadVersionRef.current) return
      setUrl(assetUrl)
    } catch (loadError) {
      if (loadVersion !== loadVersionRef.current) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to preview file"
      )
    }
  }, [filePath, revision])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      loadVersionRef.current += 1
    },
    []
  )

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (event.path === filePath || event.eventType === "rescan") {
          setRevision((current) => current + 1)
        }
      },
      [filePath]
    )
  )

  return { error, url }
}

function filenameOf(filePath: string): string {
  return filePath.split("/").pop() || filePath
}
