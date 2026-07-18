import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  type CreateEidosFileFieldInput,
  type EidosFileFieldInfo,
  type EidosFileFormulaDisplayType,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileLookupAggregate,
  type EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"

import {
  DEFAULT_BASE_NUMBER_PROPERTY,
  type EidosFileNumberProperty,
  type EidosFileSelectOption,
} from "./eidos-file-field-properties"
import {
  EidosFileFieldTypePicker,
  type EidosFileCreatableFieldType,
} from "./eidos-file-field-type-picker"
import { EidosFileFormulaComposer } from "./eidos-file-formula-composer"
import { EidosFileNumberPropertiesEditor } from "./eidos-file-number-properties-editor"
import { EidosFileOptionsEditor } from "./eidos-file-select-options-editor"
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "./ui/primitives"

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

function columnNameFor(
  label: string,
  fields: readonly EidosFileFieldInfo[]
): string {
  const ascii = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const candidate = ascii
    ? /^[0-9]/.test(ascii)
      ? `field_${ascii}`
      : ascii
    : "field"
  const used = new Set(fields.map((field) => field.tableColumnName))
  if (!used.has(candidate)) return candidate
  let suffix = 2
  while (used.has(`${candidate}_${suffix}`)) suffix += 1
  return `${candidate}_${suffix}`
}

export interface EidosFileFieldCreatePopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: EidosFileTableSnapshot
  tables: EidosFileTableSnapshot[]
  disabled?: boolean
  onCreate: (field: CreateEidosFileFieldInput) => Promise<void> | void
  onPreviewFormula?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
}

export function EidosFileFieldCreatePopover({
  open,
  onOpenChange,
  table,
  tables,
  disabled = false,
  onCreate,
  onPreviewFormula,
}: EidosFileFieldCreatePopoverProps) {
  const [name, setName] = useState("")
  const [fieldType, setFieldType] =
    useState<EidosFileCreatableFieldType>("text")
  const [options, setOptions] = useState<EidosFileSelectOption[]>([])
  const [numberProperty, setNumberProperty] = useState<EidosFileNumberProperty>(
    () => ({ ...DEFAULT_BASE_NUMBER_PROPERTY })
  )
  const [targetTableId, setTargetTableId] = useState("")
  const [targetField, setTargetField] = useState("title")
  const [multiple, setMultiple] = useState(true)
  const [formula, setFormula] = useState("")
  const [formulaDisplayType, setFormulaDisplayType] =
    useState<EidosFileFormulaDisplayType>("text")
  const [formulaValid, setFormulaValid] = useState(false)
  const [lookupRelationField, setLookupRelationField] = useState("")
  const [lookupTargetField, setLookupTargetField] = useState("")
  const [lookupAggregate, setLookupAggregate] =
    useState<EidosFileLookupAggregate>("first")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()

  useEffect(() => {
    if (!open) return
    setName("")
    setFieldType("text")
    setOptions([])
    setNumberProperty({ ...DEFAULT_BASE_NUMBER_PROPERTY })
    setTargetTableId(
      tables.find((candidate) => candidate.table.id !== table.table.id)?.table
        .id ??
        tables[0]?.table.id ??
        ""
    )
    setTargetField("title")
    setMultiple(true)
    setFormula("")
    setFormulaDisplayType("text")
    setFormulaValid(false)
    setLookupRelationField("")
    setLookupTargetField("")
    setLookupAggregate("first")
    setSubmitting(false)
    setError(null)
  }, [open, table.table.id, tables])

  const columnName = useMemo(
    () => columnNameFor(name.trim() || "field", table.fields),
    [name, table.fields]
  )
  const targetTable = tables.find(
    (candidate) => candidate.table.id === targetTableId
  )
  const relationTargetFields =
    targetTable?.fields.filter(
      (field) =>
        !field.isHidden && field.valueKind !== "relation" && !field.isDerived
    ) ?? []
  const selectedTargetField =
    relationTargetFields.find(
      (candidate) => candidate.tableColumnName === targetField
    ) ??
    relationTargetFields.find(
      (candidate) => candidate.tableColumnName === "title"
    ) ??
    relationTargetFields[0]

  const relationFields = table.fields.filter((field) => field.type === "link")
  const selectedRelation =
    relationFields.find(
      (field) => field.tableColumnName === lookupRelationField
    ) ?? relationFields[0]
  const lookupTargetTableId =
    typeof selectedRelation?.property?.targetTableId === "string"
      ? selectedRelation.property.targetTableId
      : undefined
  const lookupTargetFields = (
    lookupTargetTableId
      ? (tables.find((candidate) => candidate.table.id === lookupTargetTableId)
          ?.fields ?? [])
      : []
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
  const busy = disabled || submitting

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || busy) return
    let field: CreateEidosFileFieldInput
    if (fieldType === "link") {
      if (!targetTable || !selectedTargetField) return
      field = {
        name: trimmedName,
        columnName,
        type: "link",
        property: {
          targetTableId: targetTable.table.id,
          targetField: selectedTargetField.tableColumnName,
          multiple,
        },
      }
    } else if (fieldType === "formula") {
      if (!formula.trim() || !formulaValid) return
      field = {
        name: trimmedName,
        columnName,
        type: "formula",
        property: {
          formula: formula.trim(),
          displayType: formulaDisplayType,
        },
      }
    } else if (fieldType === "lookup") {
      if (
        !selectedRelation ||
        !selectedLookupTarget ||
        !lookupAggregateSupported
      ) {
        return
      }
      field = {
        name: trimmedName,
        columnName,
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
      }
    } else {
      field = {
        name: trimmedName,
        columnName,
        type: fieldType,
        ...(fieldType === "select" || fieldType === "multi-select"
          ? {
              property: { options },
              ...(fieldType === "multi-select"
                ? { storageCodec: "json_array" as const }
                : {}),
            }
          : fieldType === "number"
            ? { property: numberProperty }
            : {}),
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(field)
      onOpenChange(false)
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to create field"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-0 top-8 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        data-eidos-file-field-create="true"
        align="end"
        side="bottom"
        className={
          fieldType === "formula"
            ? "max-h-[var(--radix-popover-content-available-height)] w-[700px] max-w-[calc(100vw-24px)] overflow-y-auto p-0"
            : "w-80 max-w-[calc(100vw-24px)] p-0"
        }
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">New field</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Add a stored, related, or computed field to {table.table.name}.
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
                disabled={busy}
                placeholder="Status"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Type
              <EidosFileFieldTypePicker
                value={fieldType}
                onChange={setFieldType}
                disabled={busy}
              />
            </label>
            {fieldType === "select" || fieldType === "multi-select" ? (
              <EidosFileOptionsEditor
                options={options}
                disabled={busy}
                onChange={setOptions}
                className="border-t-0 pt-0"
              />
            ) : null}
            {fieldType === "number" ? (
              <EidosFileNumberPropertiesEditor
                property={numberProperty}
                disabled={busy}
                onChange={setNumberProperty}
                className="border-t-0 pt-0"
              />
            ) : null}
            {fieldType === "link" ? (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium">
                  Related table
                  <Select
                    value={targetTable?.table.id ?? ""}
                    disabled={busy}
                    onValueChange={(value) => {
                      setTargetTableId(value)
                      setTargetField("title")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a table" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((candidate) => (
                        <SelectItem
                          key={candidate.table.id}
                          value={candidate.table.id}
                        >
                          {candidate.table.name}
                          {candidate.table.id === table.table.id
                            ? " (this table)"
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Display field
                  <Select
                    value={selectedTargetField?.tableColumnName ?? ""}
                    disabled={busy}
                    onValueChange={setTargetField}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a field" />
                    </SelectTrigger>
                    <SelectContent>
                      {relationTargetFields.map((candidate) => (
                        <SelectItem
                          key={candidate.tableColumnName}
                          value={candidate.tableColumnName}
                        >
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">
                      Allow multiple records
                    </p>
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      Relation values stay ordered in a JSON array.
                    </p>
                  </div>
                  <Switch
                    checked={multiple}
                    disabled={busy}
                    aria-label="Allow multiple related records"
                    onCheckedChange={setMultiple}
                  />
                </div>
              </div>
            ) : null}
            {fieldType === "formula" ? (
              <div className="-mx-4 border-y">
                <EidosFileFormulaComposer
                  field={null}
                  fields={table.fields}
                  name={name.trim() || "Formula"}
                  columnName={columnName}
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
                  disabled={busy}
                />
              </div>
            ) : null}
            {fieldType === "lookup" ? (
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-medium">
                  Relation
                  <Select
                    value={selectedRelation?.tableColumnName ?? ""}
                    disabled={busy}
                    onValueChange={(value) => {
                      setLookupRelationField(value)
                      setLookupTargetField("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a relation" />
                    </SelectTrigger>
                    <SelectContent>
                      {relationFields.map((candidate) => (
                        <SelectItem
                          key={candidate.tableColumnName}
                          value={candidate.tableColumnName}
                        >
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Target field
                  <Select
                    value={selectedLookupTarget?.tableColumnName ?? ""}
                    disabled={busy}
                    onValueChange={setLookupTargetField}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a target field" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupTargetFields.map((candidate) => (
                        <SelectItem
                          key={candidate.tableColumnName}
                          value={candidate.tableColumnName}
                        >
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Calculate
                  <Select
                    value={lookupAggregate}
                    disabled={busy}
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
                    Add a Relation field before creating a Lookup.
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
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                !name.trim() ||
                (fieldType === "link" &&
                  (!targetTable || !selectedTargetField)) ||
                (fieldType === "formula" &&
                  (!formula.trim() || !formulaValid)) ||
                (fieldType === "lookup" &&
                  (!selectedRelation ||
                    !selectedLookupTarget ||
                    !lookupAggregateSupported))
              }
            >
              {submitting ? "Creating…" : "Create field"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
