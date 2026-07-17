import { useState } from "react"
import type { BaseRow } from "@eidos.space/base"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "@eidos.space/base"
import { FileText, FolderOpen, LoaderCircle, Plus, X } from "lucide-react"

import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"

export function BaseRecordFileEditor({
  value,
  disabled,
  onChange,
  onImportFiles,
  onImportDroppedFiles,
  onOpenFile,
  onRevealFile,
  onError,
}: {
  value: BaseRow[string]
  disabled: boolean
  onChange: (value: string | null) => Promise<void>
  onImportFiles: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
  onError?: (error: unknown) => void
}) {
  const paths = decodeBaseFilePaths(value)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const append = async (imported: string[]) => {
    if (imported.length === 0) return
    const next = Array.from(new Set([...paths, ...imported]))
    await onChange(encodeBaseFilePaths(next))
  }

  const chooseFiles = async () => {
    if (disabled || importing) return
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
        void onImportDroppedFiles(files)
          .then(append)
          .catch((error) => onError?.(error))
          .finally(() => setImporting(false))
      }}
    >
      {paths.length > 0 ? (
        <div className="grid gap-1">
          {paths.map((path) => (
            <div
              key={path}
              className="group/file flex min-w-0 items-center gap-1 rounded hover:bg-accent"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onOpenFile?.(path)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{path}</span>
              </button>
              {onRevealFile ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100"
                  aria-label={`Show ${path} in file manager`}
                  disabled={disabled || importing}
                  onClick={() => onRevealFile(path)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${path}`}
                disabled={disabled || importing}
                onClick={() =>
                  void onChange(
                    encodeBaseFilePaths(
                      paths.filter((candidate) => candidate !== path)
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
        <p className="px-1 text-xs text-muted-foreground">No files</p>
      )}
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
        {importing ? "Importing…" : "Add files"}
      </Button>
    </div>
  )
}
