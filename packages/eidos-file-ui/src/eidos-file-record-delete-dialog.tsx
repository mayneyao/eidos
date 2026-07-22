import { useEffect, useState } from "react"
import type { EidosFileFieldInfo, EidosFileRow } from "@eidos.space/eidos-file"

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

import { useEidosFileUI } from "./context"
import { eidosFileRecordTitle } from "./eidos-file-record-format"

export function EidosFileRecordDeleteDialog({
  row,
  fields = [],
  disabled = false,
  onOpenChange,
  onDelete,
  onError,
}: {
  row: EidosFileRow | null
  fields?: EidosFileFieldInfo[]
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (row: EidosFileRow) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { translate: t } = useEidosFileUI()
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
            {t("Delete “{title}”?", {
              title: eidosFileRecordTitle(row ?? {}, fields),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "This removes the record from the Eidos File. This action cannot be undone from the current view."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t("Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {deleting ? t("Deleting…") : t("Delete record")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
