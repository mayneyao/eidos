import { useMemo, useState } from "react"
import {
  upgradeEidosFileDateQuery,
  type EidosFileFieldInfo,
  type EidosFileSnapshot,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { useEidosFileUI } from "./context"
import { eidosFileCalendarPeriodOptions } from "./eidos-file-query-toolbar"
import { eidosFileErrorMessage } from "./eidos-file-error-message"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { Button } from "./ui/primitives"

/** Only retired saved queries expose this explicit semantic upgrade. */
export function EidosFileDateQueryUpgrade({
  source,
  view,
  fields,
  disabled,
  onSnapshot,
  fallback,
}: {
  source: EidosFileEditorDataSource
  view: EidosFileViewInfo
  fields: readonly EidosFileFieldInfo[]
  disabled?: boolean
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  fallback: React.ReactNode
}) {
  const { translate: t, calendarPeriodTimeZoneData } = useEidosFileUI()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEidosFilePendingEdit(pending)
  const preview = useMemo(() => {
    try {
      return upgradeEidosFileDateQuery(JSON.parse(view.query))
    } catch {
      return null
    }
  }, [view.query])
  if (!preview?.changes.length || !calendarPeriodTimeZoneData?.length)
    return fallback
  const oldLabels: Record<string, string> = {
    "calendar-day:yesterday": "Yesterday (saved time zone)",
    "calendar-day:today": "Today (saved time zone)",
    "calendar-day:tomorrow": "Tomorrow (saved time zone)",
    "relative-date:past:day": "Past 24 hours",
    "relative-date:past:week": "Past 7 days",
    "relative-date:past:month": "Past month from now",
    "relative-date:past:year": "Past year from now",
    "relative-date:next:day": "Next 24 hours",
    "relative-date:next:week": "Next 7 days",
    "relative-date:next:month": "Next month from now",
    "relative-date:next:year": "Next year from now",
    "relative-date:this:day": "Today (UTC)",
    "relative-date:this:week": "This week (UTC)",
    "relative-date:this:month": "This month (UTC)",
    "relative-date:this:year": "This year (UTC)",
  }
  return (
    <div
      className="grid justify-items-start gap-3 p-4 text-sm"
      data-eidos-file-date-query-upgrade
    >
      <p className="font-medium">{t("Date filters need updating")}</p>
      <p className="max-w-xl text-muted-foreground">
        {t(
          "Update these filters to use whole calendar periods in your current time zone. Their meaning will change as shown below. Your original query will be kept for recovery."
        )}
      </p>
      <p className="max-w-xl text-muted-foreground">
        {t(
          "After updating, this file requires Eidos with the new date filters."
        )}
      </p>
      <ul className="grid gap-1">
        {preview.changes.map((change, index) => {
          const option = eidosFileCalendarPeriodOptions.find(
            (item) => item.unit === change.unit && item.offset === change.offset
          )!
          const name =
            fields.find((field) => field.id === change.fieldId)?.name ??
            change.fieldId
          return (
            <li key={index}>
              {name}: {t(oldLabels[change.from] ?? change.from)} →{" "}
              {t(option.label)}
            </li>
          )
        })}
      </ul>
      <Button
        size="sm"
        disabled={disabled || pending}
        onClick={() => {
          if (pending) return
          setPending(true)
          setError(null)
          void source
            .updateView(view.id, { upgradeDateQuery: true })
            .then((snapshot) => onSnapshot?.(snapshot))
            .catch((cause: unknown) =>
              setError(
                eidosFileErrorMessage(cause, "Could not update date filters")
              )
            )
            .finally(() => setPending(false))
        }}
      >
        {t(pending ? "Updating…" : "Update date filters")}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive">
          {t(error)}
        </p>
      ) : null}
    </div>
  )
}
