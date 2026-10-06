import { useEidosFileUI } from "./context"
import { useState, type ReactNode } from "react"
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react"
import type {
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"
import { Switch } from "./ui/primitives"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import { orderedEidosFileFields } from "./eidos-file-view-layout"
import { isEidosFileRecordCoverField } from "./eidos-file-record-card-layout"
import { eidosFileCalendarDateFields } from "./eidos-file-calendar-view"

export function MobileLayoutChoice({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange(value: string): Promise<void>
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="mobile-setting-row"
          aria-label={label}
          disabled={disabled || !options.length}
        >
          <span>{label}</span>
          <span className="mobile-setting-value">
            {options.find((o) => o.value === value)?.label ?? t("Select")}
          </span>
          <ChevronRight size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={label}>
        <div className="mobile-setting-list">
          {error && <p role="alert">{error}</p>}
          {options.map((option) => (
            <button
              key={option.value}
              className="mobile-setting-row"
              disabled={disabled}
              aria-pressed={value === option.value}
              onClick={() =>
                void onChange(option.value)
                  .then(() => setOpen(false))
                  .catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : String(cause)
                    )
                  )
              }
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={18} />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MobileViewLayout({
  table,
  view,
  busy,
  error,
  update,
  pluginLabel,
  children,
}: {
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  busy: boolean
  error: string
  pluginLabel?: string
  children?: ReactNode
  update(
    properties: NonNullable<EidosFileViewInfo["properties"]>
  ): Promise<void>
}) {
  const t = useEidosFileUI().translate
  const p = view.properties ?? {}
  const visible = orderedEidosFileFields(table.fields, view)
  const fields = (items: typeof visible) =>
    items.map((f) => ({ value: eidosFileFieldKey(f), label: f.name }))
  const select = (
    label: string,
    key: string,
    fallback: string,
    options: { value: string; label: string }[]
  ) => (
    <MobileLayoutChoice
      label={label}
      value={String(p[key] ?? fallback)}
      options={options}
      disabled={busy}
      onChange={(value) =>
        update({ [key]: value === "__none__" ? null : value })
      }
    />
  )
  const toggle = (label: string, key: string, checked: boolean) => (
    <label className="mobile-setting-row" htmlFor={`${view.id}-${key}`}>
      <span>{label}</span>
      <Switch
        id={`${view.id}-${key}`}
        aria-label={label}
        checked={checked}
        disabled={busy}
        onCheckedChange={(value) =>
          void update({ [key]: value }).catch(() => {})
        }
      />
    </label>
  )
  const cardFields = visible.filter(
    (f) => !isEidosFileRecordLabelField(f) && f.valueKind !== "system"
  )
  const selected = Array.isArray(p.cardFields)
    ? p.cardFields.filter((id): id is string => typeof id === "string")
    : cardFields.map(eidosFileFieldKey)
  const labels: Record<string, string> = {
    grid: t("Grid"),
    gallery: t("Gallery"),
    kanban: t("Kanban"),
    calendar: t("Calendar"),
    feed: t("Feed"),
    form: t("Form"),
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="mobile-setting-row"
          aria-label={t("Layout settings")}
        >
          <SlidersHorizontal size={18} />
          <span>{t("Layout settings")}</span>
          <span className="mobile-setting-value">
            {pluginLabel ?? labels[view.type] ?? t("Plugins")}
          </span>
          <ChevronRight size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t("{view} layout", {
          view: pluginLabel ?? labels[view.type] ?? t("Plugins"),
        })}
      >
        <div className="mobile-layout-settings">
          {error && <p role="alert">{error}</p>}
          {children}
          {view.type === "grid" && (
            <section className="mobile-setting-list">
              {select(t("Row density"), "rowDensity", "standard", [
                { value: "compact", label: t("Compact") },
                { value: "standard", label: t("Standard") },
                { value: "comfortable", label: t("Comfortable") },
                { value: "huge", label: t("Extra large") },
              ])}
              {toggle(t("Wrap text"), "textWrapping", p.textWrapping === true)}
            </section>
          )}
          {view.type === "kanban" && (
            <section className="mobile-setting-list">
              {select(
                t("Group field"),
                "groupField",
                "",
                fields(table.fields.filter((f) => f.type === "select"))
              )}
              {toggle(
                t("Show empty groups"),
                "showEmptyGroups",
                p.showEmptyGroups !== false
              )}
            </section>
          )}
          {view.type === "calendar" && (
            <section className="mobile-setting-list">
              {select(t("Calendar layout"), "calendarLayout", "month", [
                { value: "month", label: t("Month") },
                { value: "week", label: t("Week") },
              ])}
              {select(
                t("Date field"),
                "dateField",
                fields(eidosFileCalendarDateFields(table.fields))[0]?.value ??
                  "",
                fields(eidosFileCalendarDateFields(table.fields))
              )}
            </section>
          )}
          {(view.type === "gallery" || view.type === "kanban") && (
            <>
              <h3>{t("Card appearance")}</h3>
              <section className="mobile-setting-list">
                {select(t("Cover field"), "coverField", "__none__", [
                  { value: "__none__", label: t("No cover") },
                  ...fields(visible.filter(isEidosFileRecordCoverField)),
                ])}
                {p.coverField
                  ? select(
                      t("Image display"),
                      "coverFit",
                      p.fitContent === true ? "contain" : "cover",
                      [
                        { value: "cover", label: t("Crop to fill") },
                        { value: "contain", label: t("Fit") },
                      ]
                    )
                  : null}
                {select(t("Card size"), "cardSize", "medium", [
                  { value: "small", label: t("Small") },
                  { value: "medium", label: t("Medium") },
                  { value: "large", label: t("Large") },
                ])}
                {toggle(
                  t("Hide empty fields"),
                  "hideEmptyFields",
                  p.hideEmptyFields !== false
                )}
              </section>
              <h3>{t("Card content")}</h3>
              <section className="mobile-setting-list">
                {cardFields.map((field) => {
                  const id = eidosFileFieldKey(field)
                  return (
                    <label className="mobile-setting-row" key={id}>
                      <span>{field.name}</span>
                      <input
                        type="checkbox"
                        aria-label={t("Show {field} on cards", {
                          field: field.name,
                        })}
                        checked={selected.includes(id)}
                        disabled={busy}
                        onChange={(event) =>
                          void update({
                            cardFields: event.target.checked
                              ? [...selected, id]
                              : selected.filter((value) => value !== id),
                          }).catch(() => {})
                        }
                      />
                    </label>
                  )
                })}
                {!cardFields.length && (
                  <p>{t("Show available fields in field settings first.")}</p>
                )}
              </section>
            </>
          )}
          {view.type === "feed" && (
            <p className="mobile-setting-note">
              {t(
                "Feed displays records over time. Adjust content with filters and sorting in view settings."
              )}
            </p>
          )}
          {view.type === "form" && (
            <p className="mobile-setting-note">
              {t(
                "Edit the title, description, question order, required fields, submit button and success message directly in the form."
              )}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
