import { useEffect, useState } from "react"
import type { BaseRow } from "@eidos.space/base"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { baseRecordTitle } from "./base-record-format"

export function BaseRecordDeleteDialog({
  row,
  onOpenChange,
  onDelete,
  onError,
}: {
  row: BaseRow | null
  onOpenChange: (open: boolean) => void
  onDelete: (row: BaseRow) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!row) setDeleting(false)
  }, [row])

  const confirm = async () => {
    if (!row || deleting) return
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
            Delete “{baseRecordTitle(row ?? {})}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the record from the Base file. This action cannot be
            undone from the current view.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
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
