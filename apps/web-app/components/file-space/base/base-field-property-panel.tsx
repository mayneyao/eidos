import { useEffect, useId, useState } from "react"
import type {
  BaseFieldInfo,
  MutableBaseFieldType,
  UpdateBaseFieldInput,
} from "@eidos.space/base"
import { MUTABLE_BASE_FIELD_TYPES } from "@eidos.space/base"
import {
  Calculator,
  Database,
  LoaderCircle,
  Trash2,
  Waypoints,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

import {
  BASE_OPTION_COLORS,
  baseNumberProperty,
  type BaseNumberProperty,
} from "./base-field-properties"
import { BaseSelectOptionsEditor } from "./base-select-options-editor"

const TYPE_LABELS: Record<MutableBaseFieldType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  file: "File",
  "multi-select": "Multi-select",
  rating: "Rating",
  select: "Select",
  url: "URL",
}

function NumberProperties({
  field,
  disabled,
  onChange,
}: {
  field: BaseFieldInfo
  disabled: boolean
  onChange: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const property = baseNumberProperty(field)
  const divideById = useId()
  const [divideBy, setDivideBy] = useState(String(property.divideBy))

  useEffect(() => setDivideBy(String(property.divideBy)), [property.divideBy])

  const update = (changes: Partial<BaseNumberProperty>) =>
    onChange({ ...property, ...changes })

  const commitDivideBy = () => {
    const value = Number(divideBy)
    if (Number.isFinite(value) && value > 0 && value !== property.divideBy) {
      void update({ divideBy: value })
    } else {
      setDivideBy(String(property.divideBy))
    }
  }

  return (
    <section className="grid gap-3 border-t pt-3">
      <h3 className="text-xs font-medium">Number display</h3>
      <label className="grid gap-1.5 text-xs">
        <span className="font-medium">Format</span>
        <Select
          value={property.format}
          disabled={disabled}
          onValueChange={(format) =>
            void update({ format: format as BaseNumberProperty["format"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="percent">Percent</SelectItem>
            <SelectItem value="currency">Currency</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Show as</span>
        <div className="grid grid-cols-2 rounded-md border p-0.5">
          {(["number", "bar"] as const).map((showAs) => (
            <button
              key={showAs}
              type="button"
              className={cn(
                "h-7 rounded-[3px] text-xs capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                property.showAs === showAs
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={disabled}
              onClick={() => void update({ showAs })}
            >
              {showAs}
            </button>
          ))}
        </div>
      </div>
      {property.showAs === "bar" ? (
        <>
          <label className="grid gap-1.5 text-xs" htmlFor={divideById}>
            <span className="font-medium">Bar maximum</span>
            <Input
              id={divideById}
              value={divideBy}
              disabled={disabled}
              inputMode="decimal"
              className="h-8 text-xs"
              onChange={(event) => setDivideBy(event.target.value)}
              onBlur={commitDivideBy}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  setDivideBy(String(property.divideBy))
                  event.currentTarget.blur()
                }
              }}
            />
          </label>
          <label className="grid gap-1.5 text-xs">
            <span className="font-medium">Bar color</span>
            <Select
              value={property.color}
              disabled={disabled}
              onValueChange={(color) => void update({ color })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_OPTION_COLORS.map((color) => (
                  <SelectItem key={color.name} value={color.name}>
                    <span className="capitalize">{color.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium">Show number</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Keep the value visible beside the bar.
              </p>
            </div>
            <Switch
              checked={property.showNumber}
              disabled={disabled}
              onCheckedChange={(showNumber) => void update({ showNumber })}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

export function BaseFieldPropertyPanel({
  field,
  disabled,
  onClose,
  onUpdate,
  onDelete,
  onEditFormula,
  onEditLookup,
}: {
  field: BaseFieldInfo
  disabled: boolean
  onClose: () => void
  onUpdate: (
    field: BaseFieldInfo,
    changes: UpdateBaseFieldInput
  ) => Promise<void> | void
  onDelete: (field: BaseFieldInfo) => void
  onEditFormula?: (field: BaseFieldInfo) => void
  onEditLookup?: (field: BaseFieldInfo) => void
}) {
  const [name, setName] = useState(field.name)
  const [pendingType, setPendingType] = useState<MutableBaseFieldType | null>(
    null
  )
  const [applyingType, setApplyingType] = useState(false)
  const nameId = useId()
  const mutable =
    field.valueKind === "source" &&
    MUTABLE_BASE_FIELD_TYPES.some((type) => type === field.type)

  useEffect(() => setName(field.name), [field.name])
  useEffect(() => setPendingType(null), [field.tableColumnName, field.type])

  const update = (changes: UpdateBaseFieldInput) =>
    Promise.resolve().then(() => onUpdate(field, changes))

  const saveName = () => {
    const next = name.trim()
    if (!next) {
      setName(field.name)
      return
    }
    if (next !== field.name) {
      void update({ name: next }).catch(() => undefined)
    }
  }

  const saveProperty = (property: Record<string, unknown>) =>
    update({ property }).catch(() => undefined)

  const applyType = async () => {
    if (!pendingType || pendingType === field.type) return
    setApplyingType(true)
    try {
      await update({ type: pendingType })
      setPendingType(null)
    } catch {
      // The parent presents the mutation error and refreshes the snapshot.
    } finally {
      setApplyingType(false)
    }
  }

  return (
    <aside
      className="flex h-full w-80 min-w-72 shrink-0 flex-col border-l bg-background"
      aria-label={`Field properties for ${field.name}`}
    >
      <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">Field properties</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {field.name}
          </p>
        </div>
        {disabled ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close field properties"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <label className="grid gap-1.5 text-xs" htmlFor={nameId}>
            <span className="font-medium">Name</span>
            <Input
              id={nameId}
              value={name}
              disabled={disabled}
              className="h-8 text-xs"
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  setName(field.name)
                  event.currentTarget.blur()
                }
              }}
            />
          </label>
          <label className="grid gap-1.5 text-xs">
            <span className="font-medium">Type</span>
            {mutable ? (
              <Select
                value={pendingType ?? field.type}
                disabled={disabled || applyingType}
                onValueChange={(type) =>
                  setPendingType(type as MutableBaseFieldType)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUTABLE_BASE_FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-8 items-center rounded-md border bg-muted/30 px-3 text-xs capitalize text-muted-foreground">
                {field.type.replaceAll("-", " ")}
              </div>
            )}
          </label>
          {pendingType && pendingType !== field.type ? (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5">
              <p className="text-[11px] leading-4 text-muted-foreground">
                Existing values will be converted in place and saved directly to
                this Base file.
              </p>
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={applyingType}
                  onClick={() => setPendingType(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={applyingType}
                  onClick={() => void applyType()}
                >
                  {applyingType ? "Converting…" : "Apply type"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <Database className="h-3 w-3 text-muted-foreground" />
              Column
            </span>
            <code className="truncate rounded-md border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              {field.tableColumnName}
            </code>
          </div>
          {field.type === "select" || field.type === "multi-select" ? (
            <BaseSelectOptionsEditor
              field={field}
              disabled={disabled}
              onChange={saveProperty}
            />
          ) : null}
          {field.type === "number" ? (
            <NumberProperties
              field={field}
              disabled={disabled}
              onChange={saveProperty}
            />
          ) : null}
          {field.type === "formula" && onEditFormula ? (
            <section className="grid gap-2 border-t pt-3">
              <h3 className="text-xs font-medium">Formula</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2 text-xs"
                disabled={disabled}
                onClick={() => onEditFormula(field)}
              >
                <Calculator className="h-3.5 w-3.5" />
                Edit formula
              </Button>
            </section>
          ) : null}
          {field.type === "lookup" && onEditLookup ? (
            <section className="grid gap-2 border-t pt-3">
              <h3 className="text-xs font-medium">Lookup</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2 text-xs"
                disabled={disabled}
                onClick={() => onEditLookup(field)}
              >
                <Waypoints className="h-3.5 w-3.5" />
                Edit lookup
              </Button>
            </section>
          ) : null}
          {field.type === "link" ? (
            <section className="grid gap-1.5 border-t pt-3">
              <h3 className="text-xs font-medium">Relation</h3>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Target table:{" "}
                {String(field.property?.targetTableId ?? "Unknown")}
              </p>
            </section>
          ) : null}
        </div>
      </ScrollArea>
      {field.tableColumnName !== "title" && field.valueKind !== "system" ? (
        <footer className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-xs text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={() => onDelete(field)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete field
          </Button>
        </footer>
      ) : null}
    </aside>
  )
}
