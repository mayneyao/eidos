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
import { eidosFileErrorMessage } from "./eidos-file-error-message"

export function EidosFileRecordDeleteDialog({
  row,
  fields = [],
  count = 1,
  disabled = false,
  onOpenChange,
  onDelete,
  onError,
}: {
  row: EidosFileRow | null
  fields?: EidosFileFieldInfo[]
  count?: number
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (row: EidosFileRow) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!row) setDeleting(false)
    setError("")
  }, [row, count])

  const confirm = async () => {
    if (!row || disabled || deleting) return
    setDeleting(true)
    setError("")
    try {
      await onDelete(row)
      onOpenChange(false)
    } catch (error) {
      setError(
        eidosFileErrorMessage(
          error,
          t("Could not delete the selected records.")
        )
      )
      onError?.(error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!deleting || open) onOpenChange(open)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count > 1
              ? t("Delete {count} records?", { count })
              : t("Delete “{title}”?", {
                  title: eidosFileRecordTitle(row ?? {}, fields),
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              count > 1
                ? "This removes the selected records from the Eidos File. This action cannot be undone from the current view."
                : "This removes the record from the Eidos File. This action cannot be undone from the current view."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}
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
            {deleting
              ? t("Deleting…")
              : count > 1
                ? t("Delete {count} records", { count })
                : t("Delete record")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
