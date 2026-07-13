import { useEffect, useId, useState, type FormEvent } from "react"
import type {
  BaseFieldInfo,
  BaseFormulaDisplayType,
  BaseFormulaPreview,
  BaseFormulaPreviewInput,
  BaseLookupAggregate,
  CreateBaseFieldInput,
  CreateBaseTableInput,
  BaseTableInfo,
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

import { BaseFormulaComposer } from "./base-formula-composer"
import {
  BaseFieldTypePicker,
  type BaseCreatableFieldType,
} from "./base-field-type-picker"
import {
  DEFAULT_BASE_NUMBER_PROPERTY,
  type BaseNumberProperty,
  type BaseSelectOption,
} from "./base-field-properties"
import { BaseNumberPropertiesEditor } from "./base-number-properties-editor"
import { BaseOptionsEditor } from "./base-select-options-editor"

const EMPTY_TABLES: BaseTableInfo[] = []

const LOOKUP_AGGREGATES: Array<{
  value: BaseLookupAggregate
  label: string
}> = [
  { value: "first", label: "First value" },
  { value: "values", label: "All values" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
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

export function BaseStructureDialog({
  mode,
  open,
  onOpenChange,
  onCreateTable,
  onCreateField,
  tables = EMPTY_TABLES,
  fields = [],
  tableFields = {},
  activeTableId,
  onPreviewFormula,
}: {
  mode: "table" | "field"
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateTable: (table: CreateBaseTableInput) => Promise<void> | void
  onCreateField: (field: CreateBaseFieldInput) => Promise<void> | void
  tables?: BaseTableInfo[]
  fields?: BaseFieldInfo[]
  tableFields?: Record<string, BaseFieldInfo[]>
  activeTableId?: string | null
  onPreviewFormula?: (
    input: BaseFormulaPreviewInput
  ) => Promise<BaseFormulaPreview>
}) {
  const [name, setName] = useState("")
  const [fieldType, setFieldType] = useState<BaseCreatableFieldType>("text")
  const [options, setOptions] = useState<BaseSelectOption[]>([])
  const [numberProperty, setNumberProperty] = useState<BaseNumberProperty>(
    () => ({
      ...DEFAULT_BASE_NUMBER_PROPERTY,
    })
  )
  const [targetTableId, setTargetTableId] = useState("")
  const [formula, setFormula] = useState("")
  const [formulaDisplayType, setFormulaDisplayType] =
    useState<BaseFormulaDisplayType>("text")
  const [formulaValid, setFormulaValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupRelationField, setLookupRelationField] = useState("")
  const [lookupTargetField, setLookupTargetField] = useState("")
  const [lookupAggregate, setLookupAggregate] =
    useState<BaseLookupAggregate>("first")
  const nameId = useId()

  useEffect(() => {
    if (!open) return
    setName("")
    setFieldType("text")
    setOptions([])
    setNumberProperty({ ...DEFAULT_BASE_NUMBER_PROPERTY })
    setFormula("")
    setFormulaDisplayType("text")
    setFormulaValid(false)
    setSubmitting(false)
    setError(null)
    setLookupRelationField("")
    setLookupTargetField("")
    setLookupAggregate("first")
    setTargetTableId(
      tables.find((table) => table.id !== activeTableId)?.id ??
        tables[0]?.id ??
        ""
    )
  }, [activeTableId, mode, open, tables])

  const hasOptions = fieldType === "select" || fieldType === "multi-select"
  const relationFields = fields.filter((field) => field.type === "link")
  const selectedRelation =
    relationFields.find(
      (field) => field.tableColumnName === lookupRelationField
    ) ?? relationFields[0]
  const lookupTargetTableId =
    typeof selectedRelation?.property?.targetTableId === "string"
      ? selectedRelation.property.targetTableId
      : tables.find(
          (table) =>
            table.rawTableName === selectedRelation?.property?.linkTableName
        )?.id
  const lookupTargetFields = (
    lookupTargetTableId ? (tableFields[lookupTargetTableId] ?? []) : []
  ).filter((field) => !field.isHidden && !field.isDerived)
  const selectedLookupTarget =
    lookupTargetFields.find(
      (field) => field.tableColumnName === lookupTargetField
    ) ??
    lookupTargetFields.find((field) => field.tableColumnName === "title") ??
    lookupTargetFields[0]
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    let creation: Promise<void> | void
    if (mode === "table") {
      creation = onCreateTable({ name: trimmedName })
    } else if (fieldType === "link") {
      if (!targetTableId) return
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: "link",
        property: {
          targetTableId,
          targetField: "title",
          multiple: true,
        },
      })
    } else if (fieldType === "formula") {
      if (!formula.trim() || !formulaValid) return
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: "formula",
        property: {
          formula: formula.trim(),
          displayType: formulaDisplayType,
        },
      })
    } else if (fieldType === "lookup") {
      if (!selectedRelation || !selectedLookupTarget) return
      const numeric = new Set<BaseLookupAggregate>([
        "count",
        "sum",
        "average",
        "min",
        "max",
      ]).has(lookupAggregate)
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: "lookup",
        property: {
          relationField: selectedRelation.tableColumnName,
          targetField: selectedLookupTarget.tableColumnName,
          aggregate: lookupAggregate,
          displayType: numeric ? "number" : "text",
        },
      })
    } else {
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: fieldType,
        ...(hasOptions
          ? {
              property: {
                options,
              },
              ...(fieldType === "multi-select"
                ? { storageCodec: "csv_ids" as const }
                : {}),
            }
          : fieldType === "number"
            ? { property: numberProperty }
            : {}),
      })
    }
    setSubmitting(true)
    setError(null)
    try {
      await creation
      onOpenChange(false)
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to create Base structure"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        className={
          mode === "field" && fieldType === "formula"
            ? "w-[700px] max-w-[calc(100vw-32px)] p-0"
            : "w-80 p-0"
        }
      >
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
        <form onSubmit={(event) => void submit(event)}>
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
                <BaseFieldTypePicker
                  value={fieldType}
                  onChange={setFieldType}
                  disabled={submitting}
                />
              </label>
            ) : null}
            {mode === "field" && hasOptions ? (
              <BaseOptionsEditor
                options={options}
                disabled={submitting}
                onChange={setOptions}
                className="border-t-0 pt-0"
              />
            ) : null}
            {mode === "field" && fieldType === "number" ? (
              <BaseNumberPropertiesEditor
                property={numberProperty}
                disabled={submitting}
                onChange={setNumberProperty}
                className="border-t-0 pt-0"
              />
            ) : null}
            {mode === "field" && fieldType === "link" ? (
              <label className="grid gap-1.5 text-xs font-medium">
                Related table
                <Select value={targetTableId} onValueChange={setTargetTableId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((table) => (
                      <SelectItem key={table.id} value={table.id}>
                        {table.name}
                        {table.id === activeTableId ? " (this table)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="font-normal leading-4 text-muted-foreground">
                  Stores stable record IDs and displays the related title.
                </span>
              </label>
            ) : null}
            {mode === "field" && fieldType === "formula" ? (
              <div className="-mx-4 border-y">
                <BaseFormulaComposer
                  field={null}
                  fields={fields}
                  name={name.trim() || "Formula"}
                  columnName={columnNameFor(name.trim() || "formula")}
                  formula={formula}
                  displayType={formulaDisplayType}
                  onFormulaChange={(value) => {
                    setFormula(value)
                    setError(null)
                  }}
                  onDisplayTypeChange={setFormulaDisplayType}
                  onPreview={onPreviewFormula}
                  onValidityChange={setFormulaValid}
                  onEscape={() => onOpenChange(false)}
                />
              </div>
            ) : null}
            {mode === "field" && fieldType === "lookup" ? (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium">
                  Relation
                  <Select
                    value={selectedRelation?.tableColumnName ?? ""}
                    onValueChange={(value) => {
                      setLookupRelationField(value)
                      setLookupTargetField("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a relation" />
                    </SelectTrigger>
                    <SelectContent>
                      {relationFields.map((field) => (
                        <SelectItem
                          key={field.tableColumnName}
                          value={field.tableColumnName}
                        >
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Target field
                  <Select
                    value={selectedLookupTarget?.tableColumnName ?? ""}
                    onValueChange={setLookupTargetField}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a target field" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupTargetFields.map((field) => (
                        <SelectItem
                          key={field.tableColumnName}
                          value={field.tableColumnName}
                        >
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Calculate
                  <Select
                    value={lookupAggregate}
                    onValueChange={(value) =>
                      setLookupAggregate(value as BaseLookupAggregate)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOOKUP_AGGREGATES.map((aggregate) => (
                        <SelectItem
                          key={aggregate.value}
                          value={aggregate.value}
                        >
                          {aggregate.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {relationFields.length === 0 ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Add a relation field before creating a lookup.
                  </p>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                submitting ||
                (mode === "field" && fieldType === "link" && !targetTableId) ||
                (mode === "field" &&
                  fieldType === "formula" &&
                  (!formula.trim() || !formulaValid)) ||
                (mode === "field" &&
                  fieldType === "lookup" &&
                  (!selectedRelation || !selectedLookupTarget))
              }
            >
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
