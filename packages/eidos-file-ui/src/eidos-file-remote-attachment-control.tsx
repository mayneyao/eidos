import { useState, type FormEvent } from "react"
import type { FileEntry } from "@eidos.space/eidos-file"
import { Link, LoaderCircle, Plus } from "lucide-react"

import { useEidosFileUI } from "./context"
import type { EidosFileUIAssetSession } from "./context"
import { eidosFileAssetRequestContext } from "./eidos-file-asset-lease"
import { cn } from "./lib/cn"
import { Button, Input } from "./ui/primitives"

function validRemoteAssetUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function eidosFileRemoteAssetAcquisitionAllowed(
  assetSession: EidosFileUIAssetSession | undefined
): assetSession is EidosFileUIAssetSession {
  return (
    assetSession?.serviceCapabilities.canUseAssets === true &&
    assetSession.services.acquireRemoteAsset !== undefined &&
    assetSession.state.capabilities.assetWriteSchemes.includes("https") &&
    !["fatal", "closed"].includes(assetSession.state.phase) &&
    assetSession.state.limits.assetBytesMax !== "0"
  )
}

export function EidosFileRemoteAttachmentControl({
  disabled = false,
  onAcquired,
  onError,
  className,
}: {
  disabled?: boolean
  onAcquired: (entry: FileEntry) => Promise<void> | void
  onError?: (error: unknown) => void
  className?: string
}) {
  const { assetSession, translate: t } = useEidosFileUI()
  const [expanded, setExpanded] = useState(false)
  const [uri, setUri] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = eidosFileRemoteAssetAcquisitionAllowed(assetSession)

  if (!available || !assetSession) return null

  const acquire = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || busy) return
    const normalizedUri = uri.trim()
    const normalizedName = name.trim()
    if (!validRemoteAssetUrl(normalizedUri)) {
      setError(t("Enter a valid HTTPS URL"))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await assetSession.services.acquireRemoteAsset!(
        {
          sessionId: assetSession.state.sessionId,
          uri: normalizedUri,
          ...(normalizedName ? { name: normalizedName } : {}),
        },
        eidosFileAssetRequestContext("remote-asset-acquire")
      )
      await onAcquired(result.entry)
      setUri("")
      setName("")
      setExpanded(false)
    } catch (acquireError) {
      setError(
        acquireError instanceof Error
          ? acquireError.message
          : t("Unable to add file from URL")
      )
      onError?.(acquireError)
    } finally {
      setBusy(false)
    }
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground",
          className
        )}
        disabled={disabled}
        onClick={() => {
          setError(null)
          setExpanded(true)
        }}
      >
        <Link className="h-3.5 w-3.5" />
        {t("Add from URL")}
      </Button>
    )
  }

  return (
    <form
      className={cn("grid gap-1.5 rounded-md bg-muted/50 p-2", className)}
      onSubmit={(event) => void acquire(event)}
    >
      <Input
        type="url"
        inputMode="url"
        autoFocus
        required
        value={uri}
        placeholder="https://example.com/file.png"
        aria-label={t("File URL")}
        disabled={disabled || busy}
        onChange={(event) => setUri(event.target.value)}
      />
      <Input
        value={name}
        placeholder={t("File name (optional)")}
        aria-label={t("File name (optional)")}
        disabled={disabled || busy}
        onChange={(event) => setName(event.target.value)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] leading-4 text-muted-foreground">
        {t("The Host verifies the remote file; its bytes stay at the URL.")}
      </p>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => {
            setExpanded(false)
            setError(null)
          }}
        >
          {t("Cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled || busy}
        >
          {busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {busy ? t("Adding…") : t("Add")}
        </Button>
      </div>
    </form>
  )
}
