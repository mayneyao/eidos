import { useEffect, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
} from "@eidos.space/eidos-file"
import { Check } from "lucide-react"

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
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  placeholder?: string
  appearance?: "field" | "record-title"
  disabled: boolean
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>
}) {
  const { timeZone, translate: t } = useEidosFileUI()
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
  const measuredText = useEidosFileAutosizedText<HTMLTextAreaElement>({
    text: draft,
    maxLines: appearance === "record-title" ? 4 : field.isRecordLabel ? 3 : 12,
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
  }, [field.type, timeZone, value])

  const commitDraft = () => {
    let next: EidosFileSqlPrimitive = draft.trim().length > 0 ? draft : null
    if (field.type === "number" || field.type === "rating") {
      const number = Number(draft)
      if (draft.trim().length > 0 && !Number.isFinite(number)) {
        setNumberError(t("Enter a finite number."))
        return
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
        return
      }
      next = date.toISOString()
    }
    setDatetimeError(null)
    setNumberError(null)
    if (!Object.is(value, next)) void onChange(next)
  }

  if (field.type === "checkbox") {
    const checkboxValue =
      value === null || value === undefined
        ? "empty"
        : value === true || value === 1 || value === "1"
          ? "checked"
          : "unchecked"
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
        aria-label={field.name}
        placeholder={placeholder}
        disabled={disabled}
        className={
          appearance === "record-title"
            ? "min-h-8 resize-none rounded-none border-0 px-0 py-0 text-xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 sm:text-2xl"
            : "min-h-8 resize-none text-xs leading-5"
        }
        style={measuredText.style}
        data-eidos-file-text-overflow={
          measuredText.overflowing ? "scroll" : undefined
        }
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
      />
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
          field.type === "integer"
            ? "numeric"
            : field.type === "number" || field.type === "rating"
              ? "decimal"
              : undefined
        }
        className="h-8 text-xs"
        onChange={(event) => {
          setDraft(event.target.value)
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
    if (field.type === "datetime") {
      return (
        <div>
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
        <div>
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
