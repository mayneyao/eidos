import { useCallback, useEffect, useState, type ReactNode } from "react"
import { type AssetLease, type FileEntry } from "@eidos.space/eidos-file"
import {
  Archive,
  Copy,
  Download,
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileVideo,
  Image,
  LoaderCircle,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import {
  assertEidosFileAssetLease,
  eidosFileAssetRequestContext,
  eidosFileAssetResolutionAllowed,
  releaseEidosFileAssetLease,
} from "./eidos-file-asset-lease"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"

function useThumbnailLease(entry: FileEntry): {
  lease: AssetLease | null
  pending: boolean
  error: string | null
} {
  const { assetPresenter, assetSession } = useEidosFileUI()
  const enabled =
    entry.mediaType.toLowerCase().startsWith("image/") &&
    assetPresenter !== undefined &&
    eidosFileAssetResolutionAllowed(assetSession, entry, "thumbnail")
  const [state, setState] = useState<{
    lease: AssetLease | null
    pending: boolean
    error: string | null
  }>({ lease: null, pending: enabled, error: null })

  useEffect(() => {
    if (!enabled || !assetSession) {
      setState({ lease: null, pending: false, error: null })
      return
    }
    let active = true
    let heldLease: AssetLease | null = null
    let released = false
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const release = () => {
      if (released || !heldLease) return
      released = true
      void releaseEidosFileAssetLease(assetSession, heldLease)
    }
    setState({ lease: null, pending: true, error: null })
    void assetSession.services
      .resolveAsset(
        {
          sessionId: assetSession.state.sessionId,
          entryId: entry.id,
          purpose: "thumbnail",
        },
        eidosFileAssetRequestContext("asset-thumbnail")
      )
      .then((lease) => {
        assertEidosFileAssetLease(assetSession, entry, "thumbnail", lease)
        heldLease = lease
        if (!active) {
          release()
          return
        }
        setState({ lease, pending: false, error: null })
        const remaining = Date.parse(lease.expiresAt) - Date.now()
        expiryTimer = setTimeout(
          () => {
            release()
            if (active) {
              setState({
                lease: null,
                pending: false,
                error: "Asset lease expired",
              })
            }
          },
          Math.min(remaining, 2_147_483_647)
        )
      })
      .catch((error: unknown) => {
        release()
        if (active) {
          setState({
            lease: null,
            pending: false,
            error: error instanceof Error ? error.message : "Asset unavailable",
          })
        }
      })
    return () => {
      active = false
      if (expiryTimer) clearTimeout(expiryTimer)
      release()
    }
  }, [
    assetSession,
    enabled,
    entry.id,
    entry.mediaType,
    entry.name,
    entry.size,
    entry.uri,
  ])

  return state
}

function EidosFileMediaIcon({ mediaType }: { mediaType: string }) {
  const family = mediaType.split("/", 1)[0]?.toLowerCase()
  const Icon =
    family === "image"
      ? Image
      : family === "audio"
        ? FileAudio
        : family === "video"
          ? FileVideo
          : family === "text" ||
              ["application/json", "application/pdf"].includes(
                mediaType.toLowerCase()
              )
            ? FileText
            : mediaType.toLowerCase().includes("zip")
              ? Archive
              : File
  return <Icon aria-hidden="true" className="h-4 w-4" />
}

function formattedSize(size: string): string {
  try {
    const bytes = BigInt(size)
    if (bytes < 1_024n) return `${bytes} B`
    if (bytes < 1_048_576n) return `${Number(bytes / 1_024n)} KiB`
    return `${Number(bytes / 1_048_576n)} MiB`
  } catch {
    return size
  }
}

export interface EidosFileEntrySurfaceProps {
  entry: FileEntry
  className?: string
  compact?: boolean
  showActions?: boolean
}

export function EidosFileEntryCoverSurface({
  entry,
  fitContent = false,
  className,
}: {
  entry: FileEntry
  fitContent?: boolean
  className?: string
}) {
  const { assetPresenter, assetSession, translate: t } = useEidosFileUI()
  const thumbnail = useThumbnailLease(entry)
  let preview: ReactNode = null
  if (thumbnail.lease && assetPresenter && assetSession) {
    try {
      preview = assetPresenter.renderImage({
        sessionId: assetSession.state.sessionId,
        lease: thumbnail.lease,
        altText: entry.name,
      })
    } catch {
      preview = null
    }
  }
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        fitContent
          ? "[&>img]:h-full [&>img]:w-full [&>img]:object-contain"
          : "[&>img]:h-full [&>img]:w-full [&>img]:object-cover",
        className
      )}
    >
      {preview ??
        (thumbnail.pending ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : (
          <EidosFileMediaIcon mediaType={entry.mediaType} />
        ))}
      <details className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-foreground shadow-sm">
        <summary className="max-w-full cursor-pointer truncate">
          {entry.name}
        </summary>
        <div className="mt-1 max-h-20 overflow-auto">
          <div>
            {entry.mediaType} · {formattedSize(entry.size)}
          </div>
          <code
            className="block select-all break-all"
            aria-label={t("File URI")}
          >
            {entry.uri}
          </code>
        </div>
      </details>
    </div>
  )
}

/**
 * Renders one File entry without interpreting or dereferencing its canonical
 * URI. Preview and activation consume Host-issued leases exclusively.
 */
export function EidosFileEntrySurface({
  entry,
  className,
  compact = false,
  showActions = true,
}: EidosFileEntrySurfaceProps) {
  const { assetPresenter, assetSession, translate: t } = useEidosFileUI()
  const thumbnail = useThumbnailLease(entry)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [activating, setActivating] = useState<"open" | "download" | null>(null)

  const activate = useCallback(
    async (action: "open" | "download") => {
      const purpose = action === "download" ? "download" : "preview"
      if (
        !assetPresenter ||
        !eidosFileAssetResolutionAllowed(assetSession, entry, purpose)
      ) {
        return
      }
      setActivating(action)
      setActivationError(null)
      let lease: AssetLease | null = null
      try {
        lease = await assetSession.services.resolveAsset(
          {
            sessionId: assetSession.state.sessionId,
            entryId: entry.id,
            purpose,
          },
          eidosFileAssetRequestContext(`asset-${action}`)
        )
        assertEidosFileAssetLease(assetSession, entry, purpose, lease)
        await assetPresenter.activate(
          {
            sessionId: assetSession.state.sessionId,
            lease,
            action,
          },
          eidosFileAssetRequestContext(`asset-${action}-activate`)
        )
      } catch (error) {
        setActivationError(
          error instanceof Error ? error.message : t("Asset unavailable")
        )
      } finally {
        if (lease) await releaseEidosFileAssetLease(assetSession, lease)
        setActivating(null)
      }
    },
    [assetPresenter, assetSession, entry, t]
  )

  let preview: ReactNode = null
  if (thumbnail.lease && assetPresenter && assetSession) {
    try {
      preview = assetPresenter.renderImage({
        sessionId: assetSession.state.sessionId,
        lease: thumbnail.lease,
        altText: entry.name,
      })
    } catch {
      preview = null
    }
  }

  const canOpen =
    assetPresenter !== undefined &&
    eidosFileAssetResolutionAllowed(assetSession, entry, "preview")
  const canDownload =
    assetPresenter !== undefined &&
    eidosFileAssetResolutionAllowed(assetSession, entry, "download")

  return (
    <div
      className={cn(
        "group/file flex min-w-0 items-center gap-2 rounded-md",
        compact ? "py-1" : "border border-border p-2",
        className
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
        {preview ??
          (thumbnail.pending ? (
            <LoaderCircle
              aria-label={t("Loading preview")}
              className="h-4 w-4 animate-spin"
            />
          ) : (
            <EidosFileMediaIcon mediaType={entry.mediaType} />
          ))}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium" title={entry.name}>
          {entry.name}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {entry.mediaType} · {formattedSize(entry.size)}
        </div>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {t("File URI")}
          </summary>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-muted px-1 py-0.5">
              {entry.uri}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={t("Copy file URI")}
              onClick={() => {
                if (typeof navigator !== "undefined") {
                  void navigator.clipboard?.writeText(entry.uri)
                }
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </details>
        {thumbnail.error || activationError ? (
          <p role="status" className="text-[11px] text-destructive">
            {activationError ?? thumbnail.error}
          </p>
        ) : null}
      </div>
      {showActions && (canOpen || canDownload) ? (
        <div className="flex shrink-0 items-center">
          {canOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={activating !== null}
              aria-label={t("Open {file}", { file: entry.name })}
              onClick={() => void activate("open")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {canDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={activating !== null}
              aria-label={t("Download {file}", { file: entry.name })}
              onClick={() => void activate("download")}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
