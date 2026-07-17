import { useEffect, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"

import { eidosFileRecordTitle } from "./eidos-file-record-format"

export function EidosFileRecordDeleteDialog({
  row,
  disabled = false,
  onOpenChange,
  onDelete,
  onError,
}: {
  row: EidosFileRow | null
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (row: EidosFileRow) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!row) setDeleting(false)
  }, [row])

  const confirm = async () => {
    if (!row || disabled || deleting) return
    setDeleting(true)
    try {
      await onDelete(row)
      onOpenChange(false)
    } catch (error) {
      onError?.(error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete “{eidosFileRecordTitle(row ?? {})}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the record from the Eidos File. This action cannot be
            undone from the current view.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {deleting ? "Deleting…" : "Delete record"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
