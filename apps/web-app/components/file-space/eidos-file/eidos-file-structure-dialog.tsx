import { useEffect, useId, useState, type FormEvent } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFormulaDisplayType,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileLookupAggregate,
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  EidosFileTableInfo,
} from "@eidos.space/eidos-file"
import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
} from "@eidos.space/eidos-file"

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

import { EidosFileFormulaComposer } from "./eidos-file-formula-composer"
import {
  EidosFileFieldTypePicker,
  type EidosFileCreatableFieldType,
} from "./eidos-file-field-type-picker"
import {
  DEFAULT_BASE_NUMBER_PROPERTY,
  type EidosFileNumberProperty,
  type EidosFileSelectOption,
} from "./eidos-file-field-properties"
import { EidosFileNumberPropertiesEditor } from "./eidos-file-number-properties-editor"
import { EidosFileOptionsEditor } from "./eidos-file-select-options-editor"

const EMPTY_TABLES: EidosFileTableInfo[] = []

const LOOKUP_AGGREGATES: Array<{
  value: EidosFileLookupAggregate
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

export function EidosFileStructureDialog({
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
  onCreateTable: (table: CreateEidosFileTableInput) => Promise<void> | void
  onCreateField: (field: CreateEidosFileFieldInput) => Promise<void> | void
  tables?: EidosFileTableInfo[]
  fields?: EidosFileFieldInfo[]
  tableFields?: Record<string, EidosFileFieldInfo[]>
  activeTableId?: string | null
  onPreviewFormula?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
}) {
  const [name, setName] = useState("")
  const [fieldType, setFieldType] =
    useState<EidosFileCreatableFieldType>("text")
  const [options, setOptions] = useState<EidosFileSelectOption[]>([])
  const [numberProperty, setNumberProperty] = useState<EidosFileNumberProperty>(
    () => ({
      ...DEFAULT_BASE_NUMBER_PROPERTY,
    })
  )
  const [targetTableId, setTargetTableId] = useState("")
  const [formula, setFormula] = useState("")
  const [formulaDisplayType, setFormulaDisplayType] =
    useState<EidosFileFormulaDisplayType>("text")
  const [formulaValid, setFormulaValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupRelationField, setLookupRelationField] = useState("")
  const [lookupTargetField, setLookupTargetField] = useState("")
  const [lookupAggregate, setLookupAggregate] =
    useState<EidosFileLookupAggregate>("first")
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
      : undefined
  const lookupTargetFields = (
    lookupTargetTableId ? (tableFields[lookupTargetTableId] ?? []) : []
  ).filter(
    (field) => !field.isHidden && (!field.isDerived || field.type === "lookup")
  )
  const selectedLookupTarget =
    lookupTargetFields.find(
      (field) => field.tableColumnName === lookupTargetField
    ) ??
    lookupTargetFields.find((field) => field.tableColumnName === "title") ??
    lookupTargetFields[0]
  const lookupAggregateSupported = selectedLookupTarget
    ? eidosFileLookupAggregateSupportsTarget(
        lookupAggregate,
        selectedLookupTarget
      )
    : false
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
      if (
        !selectedRelation ||
        !selectedLookupTarget ||
        !lookupAggregateSupported
      ) {
        return
      }
      creation = onCreateField({
        name: trimmedName,
        columnName: columnNameFor(trimmedName),
        type: "lookup",
        property: {
          relationField: selectedRelation.tableColumnName,
          targetField: selectedLookupTarget.tableColumnName,
          aggregate: lookupAggregate,
          displayType: eidosFileLookupDisplayType(
            lookupAggregate,
            selectedLookupTarget
          ),
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
                ? { storageCodec: "json_array" as const }
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
          : "Unable to create Eidos File structure"
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
            ? "max-h-[var(--radix-popover-content-available-height)] w-[700px] max-w-[calc(100vw-32px)] overflow-y-auto p-0"
            : "w-80 p-0"
        }
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {mode === "table" ? "New table" : "New field"}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {mode === "table"
              ? "Add another structured table to this Eidos File."
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
                <EidosFileFieldTypePicker
                  value={fieldType}
                  onChange={setFieldType}
                  disabled={submitting}
                />
              </label>
            ) : null}
            {mode === "field" && hasOptions ? (
              <EidosFileOptionsEditor
                options={options}
                disabled={submitting}
                onChange={setOptions}
                className="border-t-0 pt-0"
              />
            ) : null}
            {mode === "field" && fieldType === "number" ? (
              <EidosFileNumberPropertiesEditor
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
                <EidosFileFormulaComposer
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
                      setLookupAggregate(value as EidosFileLookupAggregate)
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
                          disabled={
                            !!selectedLookupTarget &&
                            !eidosFileLookupAggregateSupportsTarget(
                              aggregate.value,
                              selectedLookupTarget
                            )
                          }
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
                  (!selectedRelation ||
                    !selectedLookupTarget ||
                    !lookupAggregateSupported))
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
