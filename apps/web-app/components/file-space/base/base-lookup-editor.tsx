import { useEffect, useRef, useState, type FormEvent } from "react"
import type {
  BaseFieldInfo,
  BaseLookupAggregate,
  BaseTableSnapshot,
} from "@eidos.space/base"
import {
  baseLookupAggregateSupportsTarget,
  baseLookupDisplayType,
} from "@eidos.space/base"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const AGGREGATES: Array<{ value: BaseLookupAggregate; label: string }> = [
  { value: "first", label: "First value" },
  { value: "values", label: "All values" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
]

export function BaseLookupEditor({
  field,
  fields,
  tables,
  open,
  onOpenChange,
  onSave,
}: {
  field: BaseFieldInfo | null
  fields: BaseFieldInfo[]
  tables: BaseTableSnapshot[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const initializedSessionRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const [relationField, setRelationField] = useState("")
  const [targetField, setTargetField] = useState("")
  const [aggregate, setAggregate] = useState<BaseLookupAggregate>("first")
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
    setRelationField(
      typeof field?.property?.relationField === "string"
        ? field.property.relationField
        : ""
    )
    setTargetField(
      typeof field?.property?.targetField === "string"
        ? field.property.targetField
        : ""
    )
    setAggregate(
      AGGREGATES.some((item) => item.value === field?.property?.aggregate)
        ? (field?.property?.aggregate as BaseLookupAggregate)
        : "first"
    )
    setSaving(false)
    setError(null)
  }, [field, open, sessionKey])

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && savingRef.current) return
    onOpenChange(nextOpen)
  }

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
    ? baseLookupAggregateSupportsTarget(aggregate, selectedTarget)
    : false

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      !selectedRelation ||
      !selectedTarget ||
      !aggregateSupported ||
      savingRef.current
    ) {
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onSave({
        relationField: selectedRelation.tableColumnName,
        targetField: selectedTarget.tableColumnName,
        aggregate,
        displayType: baseLookupDisplayType(aggregate, selectedTarget),
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save lookup"
      )
      return
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={requestOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-80 p-0">
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
                  setAggregate(value as BaseLookupAggregate)
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
                        !baseLookupAggregateSupportsTarget(
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
              onClick={() => requestOpenChange(false)}
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
