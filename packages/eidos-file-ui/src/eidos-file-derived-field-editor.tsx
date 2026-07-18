import { useEffect, useState, type FormEvent } from "react"
import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  type EidosFileFieldInfo,
  type EidosFileFormulaDisplayType,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileLookupAggregate,
  type EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"

import { EidosFileFormulaComposer } from "./eidos-file-formula-composer"
import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

const AGGREGATES: Array<{
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

export function EidosFileFormulaEditorPopover({
  field,
  fields,
  open,
  onOpenChange,
  onPreview,
  onSave,
}: {
  field: EidosFileFieldInfo | null
  fields: EidosFileFieldInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreview?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const [formula, setFormula] = useState("")
  const [displayType, setDisplayType] =
    useState<EidosFileFormulaDisplayType>("text")
  const [formulaValid, setFormulaValid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !field) return
    setFormula(
      typeof field.property?.formula === "string" ? field.property.formula : ""
    )
    const savedDisplayType = field.property?.displayType
    setDisplayType(
      savedDisplayType === "number" ||
        savedDisplayType === "checkbox" ||
        savedDisplayType === "date" ||
        savedDisplayType === "datetime" ||
        savedDisplayType === "url"
        ? savedDisplayType
        : "text"
    )
    setFormulaValid(false)
    setSaving(false)
    setError(null)
  }, [field, open])

  const save = async () => {
    if (!field || !formula.trim() || !formulaValid || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ formula: formula.trim(), displayType })
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save formula"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed right-4 top-16 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        className="max-h-[var(--radix-popover-content-available-height)] w-[700px] max-w-[calc(100vw-24px)] overflow-y-auto p-0"
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit formula</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {field?.name ?? "Formula"} is validated against this Eidos File
            before saving.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <EidosFileFormulaComposer
            field={field}
            fields={fields}
            name={field?.name ?? "Formula"}
            columnName={field?.tableColumnName ?? "formula"}
            formula={formula}
            displayType={displayType}
            onFormulaChange={(value) => {
              setFormula(value)
              setError(null)
            }}
            onDisplayTypeChange={setDisplayType}
            onPreview={onPreview}
            onValidityChange={setFormulaValid}
            onEscape={() => onOpenChange(false)}
            onSaveShortcut={() => void save()}
            disabled={saving}
          />
          {error ? (
            <p
              className="border-t px-4 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !formula.trim() || !formulaValid}
            >
              {saving ? "Saving…" : "Save formula"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileLookupEditorPopover({
  field,
  fields,
  tables,
  open,
  onOpenChange,
  onSave,
}: {
  field: EidosFileFieldInfo | null
  fields: EidosFileFieldInfo[]
  tables: EidosFileTableSnapshot[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const [relationField, setRelationField] = useState("")
  const [targetField, setTargetField] = useState("")
  const [aggregate, setAggregate] = useState<EidosFileLookupAggregate>("first")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !field) return
    setRelationField(
      typeof field.property?.relationField === "string"
        ? field.property.relationField
        : ""
    )
    setTargetField(
      typeof field.property?.targetField === "string"
        ? field.property.targetField
        : ""
    )
    const savedAggregate = field.property?.aggregate
    setAggregate(
      AGGREGATES.some((candidate) => candidate.value === savedAggregate)
        ? (savedAggregate as EidosFileLookupAggregate)
        : "first"
    )
    setSaving(false)
    setError(null)
  }, [field, open])

  const relations = fields.filter((candidate) => candidate.type === "link")
  const selectedRelation =
    relations.find(
      (candidate) => candidate.tableColumnName === relationField
    ) ?? relations[0]
  const targetTableId =
    typeof selectedRelation?.property?.targetTableId === "string"
      ? selectedRelation.property.targetTableId
      : undefined
  const targets =
    tables
      .find((table) => table.table.id === targetTableId)
      ?.fields.filter(
        (candidate) =>
          !candidate.isHidden &&
          (!candidate.isDerived || candidate.type === "lookup") &&
          !(
            field &&
            candidate.tableName === field.tableName &&
            candidate.tableColumnName === field.tableColumnName
          )
      ) ?? []
  const selectedTarget =
    targets.find((candidate) => candidate.tableColumnName === targetField) ??
    targets.find((candidate) => candidate.tableColumnName === "title") ??
    targets[0]
  const aggregateSupported = selectedTarget
    ? eidosFileLookupAggregateSupportsTarget(aggregate, selectedTarget)
    : false

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRelation || !selectedTarget || !aggregateSupported || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        relationField: selectedRelation.tableColumnName,
        targetField: selectedTarget.tableColumnName,
        aggregate,
        displayType: eidosFileLookupDisplayType(aggregate, selectedTarget),
      })
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save lookup"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed right-4 top-16 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 max-w-[calc(100vw-24px)] p-0"
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit lookup</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Derive {field?.name ?? "a value"} through an existing relation.
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 px-4 py-3">
            <label className="grid gap-1.5 text-xs font-medium">
              Relation
              <Select
                value={selectedRelation?.tableColumnName ?? ""}
                disabled={saving}
                onValueChange={(value) => {
                  setRelationField(value)
                  setTargetField("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a relation" />
                </SelectTrigger>
                <SelectContent>
                  {relations.map((relation) => (
                    <SelectItem
                      key={relation.tableColumnName}
                      value={relation.tableColumnName}
                    >
                      {relation.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Target field
              <Select
                value={selectedTarget?.tableColumnName ?? ""}
                disabled={saving}
                onValueChange={setTargetField}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a target field" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem
                      key={target.tableColumnName}
                      value={target.tableColumnName}
                    >
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Calculate
              <Select
                value={aggregate}
                disabled={saving}
                onValueChange={(value) =>
                  setAggregate(value as EidosFileLookupAggregate)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATES.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      disabled={
                        !!selectedTarget &&
                        !eidosFileLookupAggregateSupportsTarget(
                          item.value,
                          selectedTarget
                        )
                      }
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
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
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !selectedRelation ||
                !selectedTarget ||
                !aggregateSupported
              }
            >
              {saving ? "Saving…" : "Save lookup"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
