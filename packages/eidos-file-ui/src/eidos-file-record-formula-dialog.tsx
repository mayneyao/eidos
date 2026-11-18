import { useCallback, useId, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileFormulaResultType,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import { columnNameFor } from "./eidos-file-field-column-name"
import {
  EidosFileFormulaComposer,
  type EidosFileFormulaInputRef,
} from "./eidos-file-formula-composer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog"
import { Button, Input } from "./ui/primitives"

const DISPLAY_TYPES: readonly EidosFileFormulaResultType[] = [
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
]

interface FormulaDraft {
  name: string
  columnName: string
  property: { formula: string; displayType: EidosFileFormulaResultType }
}

export function EidosFileRecordFormulaDialog({
  field,
  fields,
  initialName,
  rowId,
  disabled,
  onClose,
  onRestoreFocus,
  onPreview,
  onSave,
}: {
  field: EidosFileFieldInfo | null
  fields: EidosFileFieldInfo[]
  initialName: string
  rowId: string
  disabled: boolean
  onClose: () => void
  onRestoreFocus: () => void
  onPreview?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
  onSave: (draft: FormulaDraft) => Promise<void>
}) {
  const { translate: t } = useEidosFileUI()
  const nameId = useId()
  const editor = useRef<EidosFileFormulaInputRef>(null)
  const saving = useRef(false)
  const [name, setName] = useState(initialName)
  const [formula, setFormula] = useState(
    typeof field?.property?.formula === "string" ? field.property.formula : ""
  )
  const [displayType, setDisplayType] = useState(
    DISPLAY_TYPES.find((type) => type === field?.property?.displayType) ??
      "text"
  )
  const [valid, setValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const columnName =
    field?.tableColumnName ?? columnNameFor(name.trim() || "formula", fields)
  const canSave = Boolean(name.trim() && formula.trim() && valid && !disabled)
  const preview = useCallback(
    (input: EidosFileFormulaPreviewInput) =>
      onPreview!({ ...input, ...(rowId ? { rowIds: [rowId] } : {}) }),
    [onPreview, rowId]
  )
  const close = () => {
    if (!saving.current) onClose()
  }
  const save = async () => {
    if (!canSave || saving.current) return
    saving.current = true
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        columnName,
        property: { formula: formula.trim(), displayType },
      })
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("Unable to save formula")
      )
    } finally {
      saving.current = false
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        data-eidos-file-record-formula-dialog={field ? "edit" : "create"}
        overlayClassName="bg-black/30"
        className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-3xl grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0"
        onPointerDownOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          editor.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
      >
        <form
          className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <header className="min-w-0 border-b px-4 py-3 sm:px-5">
            <DialogTitle className="truncate text-base">
              {field ? t("Edit formula") : t("New formula")}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {field ? (
                <span className="mr-2 font-medium text-foreground">
                  {field.name}
                </span>
              ) : null}
              {t("Preview uses the current record.")}
            </DialogDescription>
          </header>
          <div className="min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain">
            {!field ? (
              <label
                htmlFor={nameId}
                className="flex items-center gap-3 px-3 pt-3 text-xs font-medium"
              >
                {t("Name")}
                <Input
                  id={nameId}
                  className="w-full max-w-64"
                  value={name}
                  disabled={submitting || disabled}
                  onChange={(event) => {
                    setName(event.target.value)
                    setError(null)
                  }}
                />
              </label>
            ) : null}
            <EidosFileFormulaComposer
              field={field}
              fields={fields}
              name={name}
              columnName={columnName}
              formula={formula}
              displayType={displayType}
              editorRef={editor}
              onFormulaChange={(next) => {
                setFormula(next)
                setError(null)
              }}
              onDisplayTypeChange={(next) => {
                setDisplayType(next)
                setError(null)
              }}
              onPreview={onPreview ? preview : undefined}
              onValidityChange={setValid}
              onEscape={close}
              onSaveShortcut={() => void save()}
              disabled={submitting || disabled}
            />
          </div>
          <footer className="grid gap-2 border-t px-4 py-3 sm:px-5">
            {error ? (
              <p role="alert" className="break-words text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={close}
              >
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !canSave}>
                {t(field ? "Save" : "Create field")}
              </Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
