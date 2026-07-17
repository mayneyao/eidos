import { useEffect, useId, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseOptionValueChange,
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

import { Button, Input, ScrollArea } from "./ui/primitives"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

import { baseNumberProperty } from "./base-field-properties"
import { BaseNumberPropertiesEditor } from "./base-number-properties-editor"
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
  const [pendingUpdate, setPendingUpdate] = useState(false)
  const pendingUpdateRef = useRef(false)
  const skipNameCommitRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const numberProperty = useMemo(() => baseNumberProperty(field), [field])
  const mutable =
    field.valueKind === "source" &&
    MUTABLE_BASE_FIELD_TYPES.some((type) => type === field.type)

  useEffect(
    () => setName(field.name),
    [field.name, field.tableColumnName, field.tableName]
  )
  useEffect(() => {
    setPendingType(null)
    setError(null)
  }, [field.tableColumnName, field.tableName, field.type])

  const update = async (changes: UpdateBaseFieldInput) => {
    if (pendingUpdateRef.current) {
      throw new Error("A field update is already in progress")
    }
    pendingUpdateRef.current = true
    setPendingUpdate(true)
    setError(null)
    try {
      await onUpdate(field, changes)
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update field"
      )
      throw updateError
    } finally {
      pendingUpdateRef.current = false
      setPendingUpdate(false)
    }
  }
  const busy = disabled || pendingUpdate

  const saveName = () => {
    if (skipNameCommitRef.current) {
      skipNameCommitRef.current = false
      return
    }
    const next = name.trim()
    if (!next) {
      setName(field.name)
      setError(null)
      return
    }
    if (next !== field.name) {
      void update({ name: next }).catch(() => undefined)
    }
  }

  const saveProperty = (property: Record<string, unknown>) =>
    update({ property })
  const saveOptionsProperty = (
    property: Record<string, unknown>,
    optionValueChanges?: BaseOptionValueChange[]
  ) =>
    update({
      property,
      ...(optionValueChanges ? { optionValueChanges } : {}),
    })

  const applyType = async () => {
    if (!pendingType || pendingType === field.type) return
    setApplyingType(true)
    try {
      await update({ type: pendingType })
      setPendingType(null)
    } catch {
      // The pending type and local error remain available for an in-place retry.
    } finally {
      setApplyingType(false)
    }
  }

  return (
    <aside
      className="base-detail-panel flex h-full flex-col border-l bg-background"
      data-base-detail-panel="field"
      aria-label={`Field properties for ${field.name}`}
      aria-busy={pendingUpdate ? "true" : undefined}
    >
      <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">Field properties</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {field.name}
          </p>
        </div>
        {busy ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close field properties"
          disabled={busy}
          onClick={() => {
            if (!pendingUpdateRef.current && !disabled) onClose()
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>
      {error ? (
        <p
          className="border-b bg-destructive/5 px-3 py-2 text-xs leading-4 text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <label className="grid gap-1.5 text-xs" htmlFor={nameId}>
            <span className="font-medium">Name</span>
            <Input
              id={nameId}
              value={name}
              disabled={busy}
              className="h-8 text-xs"
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  skipNameCommitRef.current = true
                  setName(field.name)
                  setError(null)
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
                disabled={busy || applyingType}
                onValueChange={(type) => {
                  setError(null)
                  setPendingType(type as MutableBaseFieldType)
                }}
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
                {field.type.replace(/-/g, " ")}
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
                  disabled={busy || applyingType}
                  onClick={() => {
                    setPendingType(null)
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy || applyingType}
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
              disabled={busy}
              onChange={saveOptionsProperty}
            />
          ) : null}
          {field.type === "number" ? (
            <BaseNumberPropertiesEditor
              property={numberProperty}
              disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
            disabled={busy}
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
