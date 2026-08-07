import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  type EidosFileFieldInfo,
  type EidosFileFormulaResultType,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileLookupAggregate,
  type EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"

import {
  EidosFileFormulaComposer,
  type EidosFileFormulaInputRef,
} from "./eidos-file-formula-composer"
import { useEidosFileUI } from "./context"
import { isEidosFileRecordLabelField } from "./eidos-file-field-visibility"
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
  const { translate: t } = useEidosFileUI()
  const editorRef = useRef<EidosFileFormulaInputRef>(null)
  const initializedSessionRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const [formula, setFormula] = useState("")
  const [displayType, setDisplayType] =
    useState<EidosFileFormulaResultType>("text")
  const [formulaValid, setFormulaValid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionKey = field
    ? `${field.tableName}:${field.tableColumnName}`
    : null

  useEffect(() => {
    if (!open) {
      initializedSessionRef.current = null
      savingRef.current = false
      setSaving(false)
      return
    }
    if (!field || !sessionKey || initializedSessionRef.current === sessionKey) {
      return
    }
    initializedSessionRef.current = sessionKey
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
    window.setTimeout(() => editorRef.current?.focus(), 0)
  }, [field, open, sessionKey])

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && savingRef.current) return
    onOpenChange(nextOpen)
  }

  const save = async () => {
    if (!field || !formula.trim() || !formulaValid || savingRef.current) {
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onSave({ formula: formula.trim(), displayType })
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("Unable to save formula")
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={requestOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed right-4 top-16 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={12}
        data-eidos-file-formula-editor
        className="max-h-[var(--radix-popover-content-available-height)] w-[600px] max-w-[calc(100vw-24px)] overflow-y-auto p-0"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="min-w-0">
              <h2 className="truncate text-xs font-medium">
                {t("Edit formula")}
              </h2>
              <p className="truncate text-[10px] text-muted-foreground">
                {field?.name ?? t("Formula")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={saving}
                onClick={() => requestOpenChange(false)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                size="xs"
                disabled={saving || !formula.trim() || !formulaValid}
              >
                {saving ? t("Saving…") : t("Save")}
              </Button>
            </div>
          </div>
          <EidosFileFormulaComposer
            field={field}
            fields={fields}
            name={field?.name ?? t("Formula")}
            columnName={field?.tableColumnName ?? "formula"}
            formula={formula}
            displayType={displayType}
            editorRef={editorRef}
            onFormulaChange={(value) => {
              setFormula(value)
              setError(null)
            }}
            onDisplayTypeChange={setDisplayType}
            onPreview={onPreview}
            onValidityChange={setFormulaValid}
            onEscape={() => requestOpenChange(false)}
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
  const { translate: t } = useEidosFileUI()
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

  const relations = fields.filter((candidate) => candidate.type === "relation")
  const selectedRelation =
    relations.find((candidate) => candidate.id === relationField) ??
    relations[0]
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
    targets.find((candidate) => candidate.id === targetField) ??
    targets.find(isEidosFileRecordLabelField) ??
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
        relationField: selectedRelation.id!,
        targetField: selectedTarget.id!,
        aggregate,
        displayType: eidosFileLookupDisplayType(aggregate, selectedTarget),
      })
      onOpenChange(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("Unable to save lookup")
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
          <h2 className="text-sm font-semibold">{t("Edit lookup")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Derive {name} through an existing relation.", {
              name: field?.name ?? t("a value"),
            })}
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 px-4 py-3">
            <label className="grid gap-1.5 text-xs font-medium">
              {t("Relation")}
              <Select
                value={selectedRelation?.id ?? ""}
                disabled={saving}
                onValueChange={(value) => {
                  setRelationField(value)
                  setTargetField("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Choose a relation")} />
                </SelectTrigger>
                <SelectContent>
                  {relations.map((relation) => (
                    <SelectItem key={relation.id!} value={relation.id!}>
                      {relation.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              {t("Target field")}
              <Select
                value={selectedTarget?.id ?? ""}
                disabled={saving}
                onValueChange={setTargetField}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Choose a target field")} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.id!} value={target.id!}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              {t("Calculate")}
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
                      {t(item.label)}
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
              {t("Cancel")}
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
              {saving ? t("Saving…") : t("Save lookup")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
