import { useEffect, useState } from "react"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

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

export function EidosFileFieldDeleteDialog({
  field,
  disabled = false,
  onOpenChange,
  onDelete,
  onError,
}: {
  field: EidosFileFieldInfo | null
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (field: EidosFileFieldInfo) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!field) setDeleting(false)
  }, [field])

  const confirm = async () => {
    if (!field || disabled || deleting) return
    setDeleting(true)
    try {
      await onDelete(field)
      onOpenChange(false)
    } catch (error) {
      onError?.(error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={Boolean(field)}
      onOpenChange={(open) => {
        if (!deleting) onOpenChange(open)
      }}
    >
      <AlertDialogContent className="max-w-sm" aria-busy={deleting}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("Delete field “{name}”?", { name: field?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "All values stored in this field will be permanently removed from the Eidos File. This cannot be undone from the current view."
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
            {deleting ? t("Deleting…") : t("Delete field")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
