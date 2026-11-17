import { useCallback, useEffect, useRef, useState } from "react"
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
import { useEidosFileUndo } from "./eidos-file-undo-scope"

export function EidosFileRecordDeleteDialog({
  row,
  fields = [],
  count = 1,
  disabled = false,
  undoableDelete = false,
  onOpenChange,
  onDelete,
  onError,
}: {
  row: EidosFileRow | null
  fields?: EidosFileFieldInfo[]
  count?: number
  disabled?: boolean
  /** Only set for a deletion wired to the surrounding shared receipt history. */
  undoableDelete?: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (row: EidosFileRow) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { translate: t } = useEidosFileUI()
  const undo = useEidosFileUndo()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const direct = Boolean(undoableDelete && undo)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const automaticTarget = useRef<EidosFileRow | null>(null)
  const latest = useRef({
    row,
    disabled,
    onDelete,
    onOpenChange,
    onError,
    direct,
    undo,
  })
  latest.current = {
    row,
    disabled,
    onDelete,
    onOpenChange,
    onError,
    direct,
    undo,
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!row) automaticTarget.current = null
    setError("")
  }, [row, count])

  const confirm = useCallback(async () => {
    const target = latest.current
    if (!target.row || target.disabled || inFlight.current) return
    inFlight.current = true
    setDeleting(true)
    setError("")
    try {
      if (target.direct)
        target.undo?.onCloseAutoFocus(
          new Event("record-delete", { cancelable: true })
        )
      await target.onDelete(target.row)
      if (mounted.current && latest.current.row === target.row) {
        target.onOpenChange(false)
        if (target.direct)
          requestAnimationFrame(() =>
            target.undo?.onCloseAutoFocus(
              new Event("record-delete", { cancelable: true })
            )
          )
      }
    } catch (error) {
      if (mounted.current && latest.current.row === target.row) {
        setError(
          eidosFileErrorMessage(error, "Could not delete the selected records.")
        )
        target.onError?.(error)
        if (target.direct && target.onError) target.onOpenChange(false)
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setDeleting(false)
    }
  }, [])

  useEffect(() => {
    if (
      !direct ||
      !row ||
      disabled ||
      deleting ||
      inFlight.current ||
      automaticTarget.current === row
    )
      return
    automaticTarget.current = row
    void confirm()
  }, [confirm, deleting, direct, disabled, row])

  if (direct && !error) return null

  return (
    <AlertDialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!deleting || open) onOpenChange(open)
      }}
    >
      <AlertDialogContent onCloseAutoFocus={undo?.onCloseAutoFocus}>
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
              undoableDelete && undo
                ? count > 1
                  ? "This removes the selected records from the Eidos File."
                  : "This removes the record from the Eidos File."
                : count > 1
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
