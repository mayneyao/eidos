import { useEffect, useId, useState, type FormEvent } from "react"
import type {
  CreateBaseFieldInput,
  CreateBaseTableInput,
} from "@eidos.space/base"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type FieldType = CreateBaseFieldInput["type"]

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "url", label: "URL" },
  { value: "file", label: "File" },
  { value: "rating", label: "Rating" },
]

function columnNameFor(label: string): string {
  const ascii = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const safe = ascii ? (/^[0-9]/.test(ascii) ? `field_${ascii}` : ascii) : ""
  return safe || `field_${Date.now().toString(36)}`
}

function optionId(name: string, index: number): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return `option_${index + 1}${slug ? `_${slug}` : ""}`
}

export function BaseStructureDialog({
  mode,
  open,
  onOpenChange,
  onCreateTable,
  onCreateField,
}: {
  mode: "table" | "field"
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateTable: (table: CreateBaseTableInput) => Promise<void> | void
  onCreateField: (field: CreateBaseFieldInput) => Promise<void> | void
}) {
  const [name, setName] = useState("")
  const [fieldType, setFieldType] = useState<FieldType>("text")
  const [options, setOptions] = useState("")
  const nameId = useId()
  const optionsId = useId()

  useEffect(() => {
    if (!open) return
    setName("")
    setFieldType("text")
    setOptions("")
  }, [mode, open])

  const hasOptions = fieldType === "select" || fieldType === "multi-select"
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    let creation: Promise<void> | void
    if (mode === "table") {
      creation = onCreateTable({ name: trimmedName })
    } else {
      const optionNames = options
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean)
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: fieldType,
        ...(hasOptions
          ? {
              property: {
                options: optionNames.map((option, index) => ({
                  id: optionId(option, index),
                  name: option,
                  color: "default",
                })),
              },
              ...(fieldType === "multi-select"
                ? { storageCodec: "csv_ids" as const }
                : {}),
            }
          : {}),
      })
    }
    void Promise.resolve(creation).catch(() => undefined)
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {mode === "table" ? "New table" : "New field"}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {mode === "table"
              ? "Add another structured table to this Base file."
              : "Add a field to the active table."}
          </p>
        </div>
        <form onSubmit={submit}>
          <div className="grid gap-4 px-4 py-3">
            <label
              className="grid gap-1.5 text-xs font-medium"
              htmlFor={nameId}
            >
              Name
              <Input
                id={nameId}
                value={name}
                autoFocus
                placeholder={mode === "table" ? "Projects" : "Status"}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {mode === "field" ? (
              <label className="grid gap-1.5 text-xs font-medium">
                Type
                <Select
                  value={fieldType}
                  onValueChange={(value) => setFieldType(value as FieldType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {mode === "field" && hasOptions ? (
              <label
                className="grid gap-1.5 text-xs font-medium"
                htmlFor={optionsId}
              >
                Options
                <Input
                  id={optionsId}
                  value={options}
                  placeholder="Todo, In progress, Done"
                  onChange={(event) => setOptions(event.target.value)}
                />
                <span className="font-normal leading-4 text-muted-foreground">
                  Separate option names with commas.
                </span>
              </label>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
