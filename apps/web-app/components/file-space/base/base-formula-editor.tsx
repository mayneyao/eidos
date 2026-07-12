import { useEffect, useState, type FormEvent } from "react"
import type { BaseFieldInfo, BaseFormulaDisplayType } from "@eidos.space/base"

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const DISPLAY_TYPES: Array<{
  value: BaseFormulaDisplayType
  label: string
}> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "url", label: "URL" },
]

export function BaseFormulaEditor({
  field,
  fields,
  open,
  onOpenChange,
  onSave,
}: {
  field: BaseFieldInfo | null
  fields: BaseFieldInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const [formula, setFormula] = useState("")
  const [displayType, setDisplayType] = useState<BaseFormulaDisplayType>("text")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFormula(
      typeof field?.property?.formula === "string" ? field.property.formula : ""
    )
    const savedDisplayType = field?.property?.displayType
    setDisplayType(
      DISPLAY_TYPES.some((type) => type.value === savedDisplayType)
        ? (savedDisplayType as BaseFormulaDisplayType)
        : "text"
    )
    setSaving(false)
    setError(null)
  }, [field, open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!field || !formula.trim()) return
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
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent align="end" side="bottom" className="w-[420px] p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit formula</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {field?.name ?? "Formula"} is calculated for every row.
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 px-4 py-3">
            <label className="grid gap-1.5 text-xs font-medium">
              Expression
              <Textarea
                value={formula}
                autoFocus
                spellCheck={false}
                className="min-h-24 resize-y font-mono text-xs leading-5"
                onChange={(event) => {
                  setFormula(event.target.value)
                  setError(null)
                }}
              />
            </label>
            <div>
              <p className="mb-1.5 text-xs font-medium">Insert field</p>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {fields
                  .filter(
                    (candidate) =>
                      !candidate.isHidden &&
                      candidate.tableColumnName !== field?.tableColumnName
                  )
                  .map((candidate) => (
                    <button
                      key={candidate.tableColumnName}
                      type="button"
                      className="h-6 max-w-40 truncate rounded-sm border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      title={`${candidate.name} · ${candidate.tableColumnName}`}
                      onClick={() =>
                        setFormula((current) =>
                          current
                            ? `${current} ${candidate.tableColumnName}`
                            : candidate.tableColumnName
                        )
                      }
                    >
                      {candidate.name}
                    </button>
                  ))}
              </div>
            </div>
            <label className="grid gap-1.5 text-xs font-medium">
              Display as
              <Select
                value={displayType}
                onValueChange={(value) =>
                  setDisplayType(value as BaseFormulaDisplayType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
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
            <Button type="submit" disabled={saving || !formula.trim()}>
              {saving ? "Saving…" : "Save formula"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
