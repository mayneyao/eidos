import { useState } from "react"
import {
  decodeEidosFileValues,
  encodeEidosFileValues,
  type EidosFileRow,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { LoaderCircle, Plus, X } from "lucide-react"

import { useEidosFileUI } from "./context"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"
import {
  EidosFileRemoteAttachmentControl,
  eidosFileRemoteAssetAcquisitionAllowed,
} from "./eidos-file-remote-attachment-control"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"

export function EidosFileRecordAttachmentEditor({
  value,
  disabled,
  onChange,
  onImportFiles,
  onImportDroppedFiles,
  onError,
}: {
  value: EidosFileRow[string]
  disabled: boolean
  onChange: (value: string | null) => Promise<void>
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
  onError?: (error: unknown) => void
}) {
  const { assetSession, translate: t } = useEidosFileUI()
  const entries = decodeEidosFileValues(value)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const commit = async (next: FileEntry[]) => {
    await onChange(next.length > 0 ? encodeEidosFileValues(next) : null)
  }
  const append = async (imported: FileEntry[]) => {
    if (imported.length === 0) return
    const existingIds = new Set(entries.map((entry) => entry.id))
    const existingUris = new Set(entries.map((entry) => entry.uri))
    await commit([
      ...entries,
      ...imported.filter(
        (entry) => !existingIds.has(entry.id) && !existingUris.has(entry.uri)
      ),
    ])
  }

  const chooseFiles = async () => {
    if (disabled || importing || !onImportFiles) return
    setImporting(true)
    try {
      await append(await onImportFiles())
    } catch (error) {
      onError?.(error)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-md border border-transparent p-1 transition-colors",
        dragging && "border-primary/40 bg-accent/50"
      )}
      onDragEnter={(event) => {
        if (!disabled && event.dataTransfer.types.includes("Files")) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragOver={(event) => {
        if (!disabled && event.dataTransfer.types.includes("Files")) {
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (disabled || !onImportDroppedFiles) return
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        setImporting(true)
        void onImportDroppedFiles(files, "drop")
          .then(append)
          .catch((error) => onError?.(error))
          .finally(() => setImporting(false))
      }}
    >
      {entries.length > 0 ? (
        <div className="grid gap-1">
          {entries.map((entry, index) => (
            <div key={entry.id} className="group/file flex min-w-0 gap-1">
              <EidosFileEntrySurface
                entry={entry}
                compact
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100"
                aria-label={t("Remove {file}", { file: entry.name })}
                disabled={disabled || importing}
                onClick={() =>
                  void commit(
                    entries.filter(
                      (_candidate, candidateIndex) => candidateIndex !== index
                    )
                  )
                }
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">{t("No files")}</p>
      )}
      {onImportFiles || eidosFileRemoteAssetAcquisitionAllowed(assetSession) ? (
        <div className="flex flex-wrap items-start gap-1">
          {onImportFiles ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground"
              disabled={disabled || importing}
              onClick={() => void chooseFiles()}
            >
              {importing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {importing ? t("Importing…") : t("Add files")}
            </Button>
          ) : null}
          <EidosFileRemoteAttachmentControl
            className="min-w-0 flex-1"
            disabled={disabled || importing}
            onAcquired={(entry) => append([entry])}
            onError={onError}
          />
        </div>
      ) : null}
    </div>
  )
}
