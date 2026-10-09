import {
  useEffect,
  useLayoutEffect,
  useState,
  type MutableRefObject,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
} from "@eidos.space/eidos-file"
import { Check, ExternalLink, Star, X } from "lucide-react"

import { useEidosFileUI } from "./context"
import { Button, Input } from "./ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/primitives"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"
import { Textarea } from "./ui/primitives"
import { SelectOptionItem } from "./ui/select-option-item"

import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { useEidosFileAutosizedText } from "./eidos-file-text-height"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import {
  eidosFileDateTimeInputValue,
  eidosFileInstantFromInputValue,
  eidosFileResolvedTimeZone,
} from "./eidos-file-date-time"

function dateTimeInputValue(
  value: EidosFileRow[string],
  timeZone?: string
): string {
  if (typeof value !== "string" || value.length === 0) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return eidosFileDateTimeInputValue(date, timeZone)
}

export function EidosFileRecordFieldEditor({
  field,
  row,
  placeholder,
  appearance = "field",
  disabled,
  onChange,
  onEnter,
  commitRef,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  placeholder?: string
  appearance?: "field" | "record-title" | "record-property"
  disabled: boolean
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>
  onEnter?: () => void
  commitRef?: MutableRefObject<(() => boolean) | null>
}) {
  const {
    activateUrl,
    timeZone,
    interactionMode,
    translate: t,
  } = useEidosFileUI()
  const mobileTitle =
    appearance === "record-title" && interactionMode === "mobile"
  const value = row[field.tableColumnName]
  const [draft, setDraft] = useState(
    field.type === "datetime"
      ? dateTimeInputValue(value, timeZone)
      : value === null || value === undefined
        ? ""
        : String(value)
  )
  const [datetimeError, setDatetimeError] = useState<string | null>(null)
  const [numberError, setNumberError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState(false)
  const measuredText = useEidosFileAutosizedText<HTMLTextAreaElement>({
    text: draft,
    maxLines: mobileTitle
      ? 6
      : appearance === "record-title"
        ? 1
        : field.isRecordLabel
          ? 3
          : 12,
    whiteSpace: appearance === "record-title" ? "normal" : undefined,
  })

  useEffect(() => {
    setDraft(
      field.type === "datetime"
        ? dateTimeInputValue(value, timeZone)
        : value === null || value === undefined
          ? ""
          : String(value)
    )
    setDatetimeError(null)
    setNumberError(null)
    setUrlError(false)
  }, [field.type, timeZone, value])

  const commitDraft = () => {
    let next: EidosFileSqlPrimitive = draft.trim().length > 0 ? draft : null
    if (field.type === "number") {
      const number = Number(draft)
      if (draft.trim().length > 0 && !Number.isFinite(number)) {
        setNumberError(t("Enter a finite number."))
        return false
      }
      next = draft.trim().length > 0 ? number : null
    } else if (field.type === "rating") {
      const number = Number(draft)
      const maximum =
        typeof field.settings?.max === "number" ? field.settings.max : 5
      if (
        draft.trim().length > 0 &&
        (!Number.isInteger(number) || number < 0 || number > maximum)
      ) {
        setNumberError(
          t("Enter a whole number from 0 to {maximum}.", { maximum })
        )
        return false
      }
      next = draft.trim().length > 0 ? number : null
    } else if (field.type === "integer" && draft.trim().length > 0) {
      next = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(draft.trim())
        ? BigInt(draft.trim())
        : draft
    } else if (field.type === "datetime" && draft) {
      const date = eidosFileInstantFromInputValue(draft, timeZone)
      if (!date) {
        setDatetimeError(
          t(
            "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
            { timeZone: eidosFileResolvedTimeZone(timeZone) }
          )
        )
        return false
      }
      next = date.toISOString()
    }
    setDatetimeError(null)
    setNumberError(null)
    if (!Object.is(value, next)) void onChange(next)
    return true
  }
  useLayoutEffect(() => {
    if (!commitRef) return
    commitRef.current = [
      "text",
      "url",
      "number",
      "integer",
      "rating",
      "date",
      "datetime",
    ].includes(field.type)
      ? commitDraft
      : null
    return () => {
      commitRef.current = null
    }
  })

  if (field.type === "checkbox") {
    const checkboxValue =
      value === null || value === undefined
        ? "empty"
        : value === true || value === 1 || value === "1"
          ? "checked"
          : "unchecked"
    if (appearance === "record-property")
      return (
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            role="checkbox"
            aria-label={field.name}
            aria-checked={
              checkboxValue === "empty" ? "mixed" : checkboxValue === "checked"
            }
            disabled={disabled}
            className="flex h-11 min-w-11 items-center justify-start"
            onClick={() => void onChange(checkboxValue === "checked" ? 0 : 1)}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded border border-input">
              {checkboxValue === "checked" ? (
                <Check size={16} />
              ) : checkboxValue === "empty" ? (
                "−"
              ) : null}
            </span>
          </button>
          {field.nullable !== false && checkboxValue !== "empty" && (
            <button
              type="button"
              disabled={disabled}
              className="flex h-11 w-11 items-center justify-center text-muted-foreground"
              aria-label={t("Clear")}
              onClick={() => void onChange(null)}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )
    return (
      <Select
        value={checkboxValue}
        disabled={disabled}
        onValueChange={(next) =>
          void onChange(next === "empty" ? null : next === "checked" ? 1 : 0)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label={field.name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.nullable !== false ? (
            <SelectItem value="empty">{t("Empty")}</SelectItem>
          ) : null}
          <SelectItem value="checked">{t("Checked")}</SelectItem>
          <SelectItem value="unchecked">{t("Unchecked")}</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (field.type === "select") {
    const options = eidosFileSelectOptions(field)
    const rawValue = typeof value === "string" && value ? value : null
    const hasUnconfiguredValue =
      rawValue !== null && !options.some((option) => option.value === rawValue)
    return (
      <Select
        value={typeof value === "string" && value ? value : "__empty__"}
        disabled={disabled}
        onValueChange={(next) =>
          void onChange(next === "__empty__" ? null : next)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label={field.name}>
          <SelectValue placeholder={placeholder ?? t("Empty")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">{t("Empty")}</SelectItem>
          {hasUnconfiguredValue ? (
            <SelectItem value={rawValue}>
              <SelectOptionItem option={{ name: rawValue, color: "default" }} />
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <SelectOptionItem option={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === "multi-select") {
    const selected = decodeEidosFileMultiSelectValues(
      typeof value === "string" ? value : null
    )
    const selectedSet = new Set(selected)
    const options = eidosFileSelectOptions(field)
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left text-xs font-normal"
            aria-label={field.name}
            disabled={disabled}
          >
            {selected.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1">
                {selected.map((selectedValue) => {
                  const option = options.find(
                    (candidate) => candidate.value === selectedValue
                  ) ?? { name: selectedValue, color: "default" }
                  return (
                    <SelectOptionItem
                      key={selectedValue}
                      option={option}
                      className="max-w-[180px]"
                    />
                  )
                })}
              </span>
            ) : (
              (placeholder ?? t("Empty"))
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <div className="grid gap-0.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className="flex h-8 items-center gap-2 rounded px-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  const next = selectedSet.has(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value]
                  void onChange(encodeEidosFileMultiSelectValues(next))
                }}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border">
                  {selectedSet.has(option.value) ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                </span>
                <SelectOptionItem option={option} className="max-w-[190px]" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  if (field.type === "text") {
    return (
      <Textarea
        ref={measuredText.ref}
        value={draft}
        rows={1}
        wrap="soft"
        aria-label={field.name}
        placeholder={placeholder}
        disabled={disabled}
        className={
          appearance === "record-property"
            ? "eidos-mobile-inline-text min-h-11 w-full resize-none overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere] rounded-none border-0 px-0 py-2 text-base leading-relaxed shadow-none focus-visible:ring-0"
            : appearance === "record-title"
              ? `min-h-8 w-full resize-none rounded-none border-0 px-0 py-0 text-xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 sm:text-2xl ${mobileTitle ? "overflow-x-hidden [overflow-wrap:anywhere]" : ""}`
              : "min-h-8 resize-none text-xs leading-5"
        }
        style={
          appearance === "record-property"
            ? { ...measuredText.style, minHeight: 44 }
            : appearance === "record-title" && !mobileTitle
              ? {
                  ...measuredText.style,
                  height: "1lh",
                  minHeight: "1lh",
                  maxHeight: "1lh",
                  overflowY: "hidden",
                }
              : measuredText.style
        }
        title={appearance === "record-title" ? draft : undefined}
        data-eidos-file-text-overflow={
          measuredText.overflowing
            ? appearance === "record-title" && !mobileTitle
              ? "clipped"
              : "scroll"
            : undefined
        }
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (
            event.key === "Enter" &&
            (appearance === "record-title" ||
              appearance === "record-property") &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault()
            event.currentTarget.blur()
            onEnter?.()
            return
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  if (field.type === "rating" && appearance === "record-property") {
    const maximum =
      typeof field.settings?.max === "number" ? field.settings.max : 5
    return (
      <div className="min-w-0">
        <div
          role="group"
          aria-label={field.name}
          className="flex min-h-11 flex-wrap items-center"
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map(
            (rating) => (
              <button
                type="button"
                key={rating}
                className="flex h-11 min-w-8 flex-1 items-center justify-center"
                disabled={disabled}
                aria-label={t("Rate {value}", { value: rating })}
                aria-pressed={Number(value) === rating && value != null}
                onClick={() => void onChange(rating)}
              >
                <Star
                  size={22}
                  fill={Number(value) >= rating ? "currentColor" : "none"}
                />
              </button>
            )
          )}
          <button
            type="button"
            disabled={disabled}
            className="h-11 min-w-8 text-sm text-muted-foreground"
            aria-label={t("Rate {value}", { value: 0 })}
            aria-pressed={value === 0}
            onClick={() => void onChange(0)}
          >
            0
          </button>
          {field.nullable !== false && value != null && (
            <button
              type="button"
              disabled={disabled}
              className="flex h-11 min-w-8 items-center justify-center text-muted-foreground"
              aria-label={t("Clear")}
              onClick={() => void onChange(null)}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const supportedInput = new Set([
    "url",
    "number",
    "integer",
    "rating",
    "date",
    "datetime",
  ])
  if (supportedInput.has(field.type)) {
    const input = (
      <Input
        type={
          field.type === "number" || field.type === "rating"
            ? "text"
            : field.type === "integer"
              ? "text"
              : field.type === "date"
                ? "date"
                : field.type === "datetime"
                  ? "datetime-local"
                  : "url"
        }
        value={draft}
        aria-label={field.name}
        placeholder={placeholder}
        aria-invalid={
          (field.type === "datetime" && Boolean(datetimeError)) ||
          ((field.type === "number" || field.type === "rating") &&
            Boolean(numberError))
        }
        disabled={disabled}
        inputMode={
          field.type === "integer" || field.type === "rating"
            ? "numeric"
            : field.type === "number"
              ? "decimal"
              : undefined
        }
        className={[
          appearance === "record-property"
            ? "h-11 min-w-0 w-full rounded-none border-0 px-0 text-base shadow-none focus-visible:ring-0"
            : "h-8 text-xs",
          field.type === "url" ? "pr-9" : "",
        ].join(" ")}
        onChange={(event) => {
          setDraft(event.target.value)
          if (field.type === "url") setUrlError(false)
          if (field.type === "datetime") setDatetimeError(null)
          if (field.type === "number" || field.type === "rating") {
            setNumberError(null)
          }
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(
              field.type === "datetime"
                ? dateTimeInputValue(value, timeZone)
                : value === null || value === undefined
                  ? ""
                  : String(value)
            )
            setDatetimeError(null)
            setNumberError(null)
            event.currentTarget.blur()
          }
        }}
      />
    )
    if (field.type === "url") {
      return (
        <div className="min-w-0">
          <div className="relative">
            {input}
            {activateUrl && eidosFileUrlIsActivatable(draft) ? (
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                aria-label={t("Open URL")}
                title={t("Open URL")}
                disabled={disabled}
                onClick={async () => {
                  setUrlError(false)
                  try {
                    await activateUrl(draft)
                  } catch {
                    setUrlError(true)
                  }
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {urlError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {t("Could not open URL. Try again.")}
            </p>
          ) : null}
        </div>
      )
    }
    if (field.type === "datetime") {
      return (
        <div className="min-w-0">
          {input}
          <p
            className={
              datetimeError
                ? "mt-1 text-[10px] leading-4 text-destructive"
                : "mt-1 text-[10px] text-muted-foreground"
            }
          >
            {datetimeError ??
              t("Time zone: {timeZone}", {
                timeZone: eidosFileResolvedTimeZone(timeZone),
              })}
          </p>
        </div>
      )
    }
    if (field.type === "number" || field.type === "rating") {
      return (
        <div className="min-w-0">
          {input}
          {numberError ? (
            <p className="mt-1 text-[10px] leading-4 text-destructive">
              {numberError}
            </p>
          ) : null}
        </div>
      )
    }
    return input
  }

  return null
}
