import { useEffect, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  canonicalizeEidosFileJson,
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
import { Switch, Textarea } from "./ui/primitives"
import { SelectOptionItem } from "./ui/select-option-item"

import { eidosFileSelectOptions } from "./eidos-file-field-properties"

function dateTimeInputValue(value: EidosFileRow[string]): string {
  if (typeof value !== "string" || value.length === 0) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function EidosFileRecordFieldEditor({
  field,
  row,
  disabled,
  onChange,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  disabled: boolean
  onChange: (value: EidosFileSqlPrimitive) => Promise<void>
}) {
  const { translate: t } = useEidosFileUI()
  const value = row[field.tableColumnName]
  const [draft, setDraft] = useState(
    field.type === "datetime"
      ? dateTimeInputValue(value)
      : value === null || value === undefined
        ? ""
        : String(value)
  )

  useEffect(() => {
    setDraft(
      field.type === "datetime"
        ? dateTimeInputValue(value)
        : value === null || value === undefined
          ? ""
          : String(value)
    )
  }, [field.type, value])

  const commitDraft = () => {
    let next: EidosFileSqlPrimitive = draft.trim().length > 0 ? draft : null
    if (field.type === "number" || field.type === "rating") {
      const number = Number(draft)
      next = draft.trim().length > 0 && Number.isFinite(number) ? number : null
    } else if (field.type === "integer" && draft.trim().length > 0) {
      next = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(draft.trim())
        ? BigInt(draft.trim())
        : draft
    } else if (field.type === "json" && draft.trim().length > 0) {
      try {
        next = canonicalizeEidosFileJson(JSON.parse(draft))
      } catch {
        next = draft
      }
    } else if (field.type === "datetime" && draft) {
      const date = new Date(draft)
      next = Number.isNaN(date.getTime()) ? null : date.toISOString()
    }
    if (!Object.is(value, next)) void onChange(next)
  }

  if (field.type === "checkbox") {
    const checked = value === true || value === 1 || value === "1"
    return (
      <label className="flex items-center justify-between gap-3 text-xs">
        <span>{checked ? t("Checked") : t("Unchecked")}</span>
        <Switch
          aria-label={field.name}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => void onChange(next ? 1 : 0)}
        />
      </label>
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
          <SelectValue placeholder={t("Empty")} />
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
              t("Empty")
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

  if (field.type === "text" || field.type === "json") {
    return (
      <Textarea
        value={draft}
        rows={field.isRecordLabel ? 1 : field.type === "json" ? 5 : 3}
        aria-label={field.name}
        disabled={disabled}
        className={
          field.type === "json"
            ? "min-h-24 resize-y font-mono text-xs"
            : "min-h-8 resize-y text-xs"
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
    return (
      <Input
        type={
          field.type === "number" || field.type === "rating"
            ? "number"
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
        disabled={disabled}
        inputMode={field.type === "integer" ? "numeric" : undefined}
        className="h-8 text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(value === null || value === undefined ? "" : String(value))
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return null
}
