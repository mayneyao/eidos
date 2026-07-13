import { useEffect, useRef, useState, type FormEvent } from "react"
import type {
  BaseFieldInfo,
  BaseFormulaDisplayType,
  BaseFormulaPreview,
  BaseFormulaPreviewInput,
} from "@eidos.space/base"

import type { CodeMirrorFormulaEditorRef } from "@/components/formula-editor/codemirror-editor"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { BaseFormulaComposer } from "./base-formula-composer"

export function BaseFormulaEditor({
  field,
  fields,
  open,
  onOpenChange,
  onPreview,
  onSave,
}: {
  field: BaseFieldInfo | null
  fields: BaseFieldInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreview?: (input: BaseFormulaPreviewInput) => Promise<BaseFormulaPreview>
  onSave: (property: Record<string, unknown>) => Promise<void> | void
}) {
  const editorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const initializedSessionRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const [formula, setFormula] = useState("")
  const [displayType, setDisplayType] = useState<BaseFormulaDisplayType>("text")
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
      typeof field?.property?.formula === "string" ? field.property.formula : ""
    )
    const savedDisplayType = field?.property?.displayType
    setDisplayType(
      typeof savedDisplayType === "string"
        ? (savedDisplayType as BaseFormulaDisplayType)
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
    if (!field || !formulaValid || !formula.trim() || savingRef.current) {
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onSave({ formula: formula.trim(), displayType })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save formula"
      )
      return
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    onOpenChange(false)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save()
  }

  return (
    <Popover open={open} onOpenChange={requestOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute right-2 top-10 h-px w-px" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[700px] max-w-[calc(100vw-32px)] p-0"
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit formula</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {field?.name ?? "Formula"} is validated against this Base before it
            is saved.
          </p>
        </div>
        <form onSubmit={submit}>
          <BaseFormulaComposer
            field={field}
            fields={fields}
            name={field?.name ?? "Formula"}
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
