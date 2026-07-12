import { useEffect, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import { decodeBaseFilePaths } from "@eidos.space/base"
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Minus,
  Save,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

import { BaseRecordFieldEditor } from "./base-record-field-editor"
import { baseRecordFieldText, baseRecordTitle } from "./base-record-format"

function FieldValue({
  field,
  row,
  onOpenFile,
  onRevealFile,
}: {
  field: BaseFieldInfo
  row: BaseRow
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
}) {
  const value = row[field.tableColumnName]
  if (field.type === "checkbox") {
    const checked = value === true || value === 1 || value === "1"
    return (
      <span className="flex items-center gap-1.5 text-xs">
        {checked ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {checked ? "Checked" : "Unchecked"}
      </span>
    )
  }
  if (field.type === "file") {
    const paths = decodeBaseFilePaths(value)
    if (paths.length === 0) {
      return <span className="text-xs text-muted-foreground">Empty</span>
    }
    return (
      <div className="grid gap-1">
        {paths.map((path) => (
          <div
            key={path}
            className="group/file flex min-w-0 items-center gap-1"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => onOpenFile?.(path)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{path}</span>
            </button>
            {onRevealFile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100"
                aria-label={`Show ${path} in file manager`}
                onClick={() => onRevealFile(path)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    )
  }
  if (field.type === "url" && typeof value === "string" && value.length > 0) {
    return (
      <button
        type="button"
        className="flex max-w-full items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-xs text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => window.open(value, "_blank", "noopener,noreferrer")}
      >
        <span className="truncate">{value}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </button>
    )
  }
  const display = baseRecordFieldText(row, field)
  return (
    <p
      className={
        display === "Empty"
          ? "text-xs text-muted-foreground"
          : "whitespace-pre-wrap break-words text-xs leading-5"
      }
    >
      {display}
    </p>
  )
}

export function BaseRecordInspector({
  row,
  fields,
  onClose,
  onCopyRecordId,
  onCellEdit,
  disabled = false,
  onError,
  onOpenFile,
  onRevealFile,
}: {
  row: BaseRow
  fields: BaseFieldInfo[]
  onClose: () => void
  onCopyRecordId: (id: string) => void
  onCellEdit?: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  disabled?: boolean
  onError?: (error: unknown) => void
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
}) {
  const [currentRow, setCurrentRow] = useState(row)
  const [savingField, setSavingField] = useState<string | null>(null)
  useEffect(() => setCurrentRow(row), [row])
  const title = baseRecordTitle(currentRow)
  const rowId =
    typeof currentRow._id === "string"
      ? currentRow._id
      : String(currentRow._id ?? "")

  const editField = async (field: BaseFieldInfo, value: BaseSqlPrimitive) => {
    if (!onCellEdit || disabled || savingField) return
    const previous = currentRow
    setCurrentRow((current) => ({
      ...current,
      [field.tableColumnName]: value,
    }))
    setSavingField(field.tableColumnName)
    try {
      const result = await onCellEdit(previous, field, value)
      setCurrentRow(result.row)
    } catch (error) {
      setCurrentRow(previous)
      onError?.(error)
    } finally {
      setSavingField(null)
    }
  }

  return (
    <aside
      className="flex h-full w-80 min-w-72 shrink-0 flex-col border-l bg-background"
      aria-label={`Record details for ${title}`}
    >
      <header className="flex min-h-12 items-start gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-sm font-medium">{title}</h2>
            {savingField ? (
              <span
                role="status"
                aria-live="polite"
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
              >
                <Save className="h-3 w-3" />
                Saving…
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="mt-0.5 flex max-w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onCopyRecordId(rowId)}
          >
            <span className="truncate">{rowId}</span>
            <Copy className="h-3 w-3 shrink-0" />
          </button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Close record details"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y">
          {fields.map((field) => (
            <div key={field.tableColumnName} className="grid gap-1 px-3 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                {field.name}
              </p>
              {onCellEdit &&
              (field.valueKind === "source" || field.type === "title") &&
              field.type !== "file" &&
              field.type !== "link" ? (
                <BaseRecordFieldEditor
                  field={field}
                  row={currentRow}
                  disabled={disabled || savingField !== null}
                  onChange={(value) => editField(field, value)}
                />
              ) : (
                <FieldValue
                  field={field}
                  row={currentRow}
                  onOpenFile={onOpenFile}
                  onRevealFile={onRevealFile}
                />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
