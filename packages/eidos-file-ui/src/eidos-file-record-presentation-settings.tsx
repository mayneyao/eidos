import { useRef, useState } from "react"
import { useEidosFileUI } from "./context"
import { useRecordFieldManagement } from "./eidos-file-record-field-context"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

/** A Table setting, deliberately separate from the active View's column layout. */
export function EidosFileRecordPresentationSettings() {
  const management = useRecordFieldManagement()
  const { translate: t, defaultHideSystemFieldsInRecords = false } =
    useEidosFileUI()
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEidosFilePendingEdit(busy || error !== null)
  if (!management) return null
  const table = management.table.table
  const override = table.settings?.hideSystemFieldsInRecords
  const disabled =
    management.disabled ||
    busy ||
    (table.settings?.capabilities as { alterSchema?: boolean } | undefined)
      ?.alterSchema === false
  return (
    <section
      className="grid gap-2 border-t px-3 py-2.5"
      data-eidos-record-presentation-settings
    >
      <div>
        <p className="text-xs font-medium">{t("Open records · this table")}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {t("System fields in records. View columns are unchanged.")}
        </p>
      </div>
      <Select
        value={typeof override === "boolean" ? String(override) : "default"}
        disabled={disabled}
        onValueChange={(value) => {
          if (disabled || locked.current) return
          locked.current = true
          setBusy(true)
          setError(null)
          void management.source
            .updateTable(table.id, {
              hideSystemFieldsInRecords:
                value === "default" ? null : value === "true",
            })
            .then((snapshot) => management.onSnapshot?.(snapshot))
            .catch((cause: unknown) => {
              setError(
                cause instanceof Error
                  ? cause.message
                  : t("Unable to update table")
              )
            })
            .finally(() => {
              locked.current = false
              setBusy(false)
            })
        }}
      >
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={t("System fields in open records")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">
            {defaultHideSystemFieldsInRecords
              ? t("Follow app default (hidden)")
              : t("Follow app default (shown)")}
          </SelectItem>
          <SelectItem value="true">{t("Hide system fields")}</SelectItem>
          <SelectItem value="false">{t("Show system fields")}</SelectItem>
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
