import { useEffect, useId, useMemo, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileOptionValueChange,
  EidosFileTableSnapshot,
  MutableEidosFileFieldType,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import { MUTABLE_BASE_FIELD_TYPES } from "@eidos.space/eidos-file"
import {
  Calculator,
  ChevronRight,
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

import { useEidosFileUI } from "./context"
import { EidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import { eidosFileNumberProperty } from "./eidos-file-field-properties"
import { isEidosFileRecordLabelField } from "./eidos-file-field-visibility"
import { EidosFileNumberPropertiesEditor } from "./eidos-file-number-properties-editor"
import { EidosFileSelectOptionsEditor } from "./eidos-file-select-options-editor"

const TYPE_LABELS: Record<MutableEidosFileFieldType, string> = {
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

const LOOKUP_AGGREGATE_LABELS: Record<string, string> = {
  first: "First value",
  values: "All values",
  count: "Count",
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
}

export function EidosFileFieldPropertyPanel({
  field,
  tables = [],
  disabled,
  onClose,
  onUpdate,
  onDelete,
  onEditFormula,
  onEditLookup,
}: {
  field: EidosFileFieldInfo
  tables?: readonly EidosFileTableSnapshot[]
  disabled: boolean
  onClose: () => void
  onUpdate: (
    field: EidosFileFieldInfo,
    changes: UpdateEidosFileFieldInput
  ) => Promise<void> | void
  onDelete: (field: EidosFileFieldInfo) => void
  onEditFormula?: (field: EidosFileFieldInfo) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [name, setName] = useState(field.name)
  const [pendingType, setPendingType] =
    useState<MutableEidosFileFieldType | null>(null)
  const [applyingType, setApplyingType] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState(false)
  const pendingUpdateRef = useRef(false)
  const skipNameCommitRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const systemReadOnly = field.valueKind === "system"
  const numberProperty = useMemo(() => eidosFileNumberProperty(field), [field])
  const mutable =
    field.valueKind === "source" &&
    MUTABLE_BASE_FIELD_TYPES.some((type) => type === field.type)
  const currentTable = tables.find(
    (candidate) => candidate.table.id === field.tableId
  )
  const relationTargetTableId =
    typeof field.property?.targetTableId === "string"
      ? field.property.targetTableId
      : null
  const relationTargetTable = tables.find(
    (candidate) => candidate.table.id === relationTargetTableId
  )
  const lookupRelationId =
    typeof field.property?.relationField === "string"
      ? field.property.relationField
      : null
  const lookupRelation = currentTable?.fields.find(
    (candidate) => candidate.id === lookupRelationId
  )
  const lookupTargetTableId =
    typeof lookupRelation?.property?.targetTableId === "string"
      ? lookupRelation.property.targetTableId
      : null
  const lookupTargetTable = tables.find(
    (candidate) => candidate.table.id === lookupTargetTableId
  )
  const lookupTargetId =
    typeof field.property?.targetField === "string"
      ? field.property.targetField
      : null
  const lookupTarget = lookupTargetTable?.fields.find(
    (candidate) => candidate.id === lookupTargetId
  )
  const physicalColumn =
    field.physicalName ??
    (field.tableColumnName !== field.id ? field.tableColumnName : null)

  useEffect(
    () => setName(field.name),
    [field.name, field.tableColumnName, field.tableName]
  )
  useEffect(() => {
    setPendingType(null)
    setError(null)
  }, [field.tableColumnName, field.tableName, field.type])

  const update = async (changes: UpdateEidosFileFieldInput) => {
    if (pendingUpdateRef.current) {
      throw new Error(t("A field update is already in progress"))
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
          : t("Unable to update field")
      )
      throw updateError
    } finally {
      pendingUpdateRef.current = false
      setPendingUpdate(false)
    }
  }
  const busy = disabled || pendingUpdate

  const saveName = () => {
    if (systemReadOnly) {
      setName(field.name)
      setError(null)
      return
    }
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
    optionValueChanges?: EidosFileOptionValueChange[]
  ) => {
    const options = Array.isArray(property.options)
      ? property.options.flatMap((option) => {
          if (!option || Array.isArray(option) || typeof option !== "object") {
            return []
          }
          const candidate = option as Record<string, unknown>
          const name =
            typeof candidate.name === "string"
              ? candidate.name
              : typeof candidate.value === "string"
                ? candidate.value
                : null
          if (name === null) return []
          return [
            {
              name,
              color:
                typeof candidate.color === "string"
                  ? candidate.color
                  : "default",
            },
          ]
        })
      : undefined
    return update({
      property: options ? { ...property, options } : property,
      ...(optionValueChanges ? { optionValueChanges } : {}),
    })
  }

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
      className="eidos-file-detail-panel flex h-full flex-col border-l bg-background"
      data-eidos-file-detail-panel="field"
      aria-label={t("Field properties for {name}", { name: field.name })}
      aria-busy={pendingUpdate ? "true" : undefined}
    >
      <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">
            {t("Field properties")}
          </h2>
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
          aria-label={t("Close field properties")}
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
            <span className="font-medium">{t("Name")}</span>
            <Input
              id={nameId}
              value={name}
              disabled={busy || systemReadOnly}
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
            <span className="font-medium">{t("Type")}</span>
            {mutable ? (
              <Select
                value={pendingType ?? field.type}
                disabled={busy || applyingType}
                onValueChange={(type) => {
                  setError(null)
                  setPendingType(type as MutableEidosFileFieldType)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUTABLE_BASE_FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <EidosFileFieldTypeIcon
                          type={type}
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        />
                        <span>{t(TYPE_LABELS[type])}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-8 items-center rounded-md border bg-muted/30 px-3 text-xs capitalize text-muted-foreground">
                {t(field.type.replace(/-/g, " "))}
              </div>
            )}
          </label>
          {pendingType && pendingType !== field.type ? (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5">
              <p className="text-[11px] leading-4 text-muted-foreground">
                {t(
                  "Existing values will be converted in place and saved directly to this Eidos File."
                )}
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
                  {t("Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy || applyingType}
                  onClick={() => void applyType()}
                >
                  {applyingType ? t("Converting…") : t("Apply type")}
                </Button>
              </div>
            </div>
          ) : null}
          {field.type === "select" || field.type === "multi-select" ? (
            <EidosFileSelectOptionsEditor
              field={field}
              disabled={busy}
              onChange={saveOptionsProperty}
            />
          ) : null}
          {field.type === "number" ? (
            <EidosFileNumberPropertiesEditor
              property={numberProperty}
              disabled={busy}
              onChange={saveProperty}
            />
          ) : null}
          {field.type === "formula" && onEditFormula ? (
            <section className="grid gap-2 border-t pt-3">
              <h3 className="text-xs font-medium">{t("Formula")}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2 text-xs"
                disabled={busy}
                onClick={() => onEditFormula(field)}
              >
                <Calculator className="h-3.5 w-3.5" />
                {t("Edit formula")}
              </Button>
            </section>
          ) : null}
          {field.type === "lookup" && onEditLookup ? (
            <section className="grid gap-2 border-t pt-3">
              <h3 className="text-xs font-medium">{t("Lookup")}</h3>
              <dl
                className="grid gap-1 text-[11px] leading-4"
                data-eidos-file-lookup-summary
              >
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("Relation")}</dt>
                  <dd className="truncate font-medium">
                    {lookupRelation?.name ?? t("Relation unavailable")}
                  </dd>
                </div>
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("Target field")}</dt>
                  <dd className="truncate font-medium">
                    {lookupTarget?.name ?? t("Field unavailable")}
                  </dd>
                </div>
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("Calculate")}</dt>
                  <dd className="truncate font-medium">
                    {t(
                      LOOKUP_AGGREGATE_LABELS[
                        String(field.property?.aggregate ?? "first")
                      ] ?? "First value"
                    )}
                  </dd>
                </div>
              </dl>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-2 text-xs"
                disabled={busy}
                onClick={() => onEditLookup(field)}
              >
                <Waypoints className="h-3.5 w-3.5" />
                {t("Edit lookup")}
              </Button>
            </section>
          ) : null}
          {field.type === "relation" ? (
            <section
              className="grid gap-1.5 border-t pt-3"
              data-eidos-file-relation-summary
            >
              <h3 className="text-xs font-medium">{t("Relation")}</h3>
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-[11px] leading-4">
                <span className="text-muted-foreground">
                  {t("Related table")}
                </span>
                <span className="truncate font-medium">
                  {relationTargetTable?.table.name ?? t("Table unavailable")}
                </span>
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {field.property?.cardinality === "one" ||
                field.property?.multiple === false
                  ? t("Links to one record")
                  : t("Links to multiple records")}
              </p>
            </section>
          ) : null}
          <details
            className="group border-t pt-3 text-xs"
            data-eidos-file-technical-details
          >
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground marker:content-none">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              <Database className="h-3 w-3" />
              {t("Technical details")}
            </summary>
            <div className="mt-2 grid gap-2 pl-4">
              <div className="grid gap-1">
                <span className="text-[10px] text-muted-foreground">
                  {t("Field ID")}
                </span>
                <code className="truncate rounded border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                  {field.id}
                </code>
              </div>
              {physicalColumn ? (
                <div className="grid gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {t("Physical column")}
                  </span>
                  <code className="truncate rounded border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                    {physicalColumn}
                  </code>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </ScrollArea>
      {!isEidosFileRecordLabelField(field) && field.valueKind !== "system" ? (
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
            {t("Delete field")}
          </Button>
        </footer>
      ) : null}
    </aside>
  )
}
