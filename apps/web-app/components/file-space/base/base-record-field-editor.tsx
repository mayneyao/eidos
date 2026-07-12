import { useEffect, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { baseSelectOptions } from "./base-field-properties"

function multiSelectIds(value: BaseRow[string]): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (candidate): candidate is string => typeof candidate === "string"
        )
      }
    } catch {
      // Fall through to the v1 comma-separated representation.
    }
  }
  return value.split(",").filter(Boolean)
}

function dateTimeInputValue(value: BaseRow[string]): string {
  if (typeof value !== "string" || value.length === 0) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function BaseRecordFieldEditor({
  field,
  row,
  disabled,
  onChange,
}: {
  field: BaseFieldInfo
  row: BaseRow
  disabled: boolean
  onChange: (value: BaseSqlPrimitive) => Promise<void>
}) {
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
    let next: BaseSqlPrimitive = draft.trim().length > 0 ? draft : null
    if (field.type === "number" || field.type === "rating") {
      const number = Number(draft)
      next = draft.trim().length > 0 && Number.isFinite(number) ? number : null
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
        <span>{checked ? "Checked" : "Unchecked"}</span>
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
    return (
      <Select
        value={typeof value === "string" && value ? value : "__empty__"}
        disabled={disabled}
        onValueChange={(next) =>
          void onChange(next === "__empty__" ? null : next)
        }
      >
        <SelectTrigger className="h-8 text-xs" aria-label={field.name}>
          <SelectValue placeholder="Empty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">Empty</SelectItem>
          {baseSelectOptions(field).map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === "multi-select") {
    const selected = multiSelectIds(value)
    const selectedSet = new Set(selected)
    const options = baseSelectOptions(field)
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
            {selected.length > 0
              ? selected
                  .map(
                    (id) =>
                      options.find((option) => option.id === id)?.name ?? id
                  )
                  .join(", ")
              : "Empty"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <div className="grid gap-0.5">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex h-8 items-center gap-2 rounded px-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  const next = selectedSet.has(option.id)
                    ? selected.filter((id) => id !== option.id)
                    : [...selected, option.id]
                  void onChange(next.length > 0 ? next.join(",") : null)
                }}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border">
                  {selectedSet.has(option.id) ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                </span>
                <span className="truncate">{option.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  if (field.type === "text" || field.type === "title") {
    return (
      <Textarea
        value={draft}
        rows={field.type === "title" ? 1 : 3}
        aria-label={field.name}
        disabled={disabled}
        className="min-h-8 resize-y text-xs"
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
            : field.type === "date"
              ? "date"
              : field.type === "datetime"
                ? "datetime-local"
                : "url"
        }
        value={draft}
        aria-label={field.name}
        disabled={disabled}
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
