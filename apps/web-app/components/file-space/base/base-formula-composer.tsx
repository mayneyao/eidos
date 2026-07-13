import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  compileBaseFormula,
  compileBaseFormulaFields,
  type BaseFieldInfo,
  type BaseFormulaDisplayType,
  type BaseFormulaPreview,
  type BaseFormulaPreviewInput,
  type BaseRowValue,
} from "@eidos.space/base"
import {
  AlertCircle,
  Check,
  FunctionSquare,
  LoaderCircle,
  Variable,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CodeMirrorFormulaEditor,
  type CodeMirrorFormulaEditorRef,
} from "@/components/formula-editor/codemirror-editor"
import {
  getCompletions,
  type UiColumn,
} from "@/components/formula-editor/completions"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

type FormulaStatus = "idle" | "checking" | "valid" | "error"

function formulaDraftFields(
  field: BaseFieldInfo | null,
  fields: BaseFieldInfo[],
  input: BaseFormulaPreviewInput
): BaseFieldInfo[] {
  const existing =
    field ??
    fields.find(
      (candidate) => candidate.tableColumnName === input.columnName
    ) ??
    null
  const draft: BaseFieldInfo = existing
    ? {
        ...existing,
        name: input.name,
        property: {
          formula: input.formula,
          displayType: input.displayType,
        },
        dependsOn: null,
      }
    : {
        name: input.name,
        type: "formula",
        tableName: fields[0]?.tableName ?? "tb_preview",
        tableColumnName: input.columnName,
        property: {
          formula: input.formula,
          displayType: input.displayType,
        },
        storageCodec: "scalar",
        valueKind: "derived",
        isHidden: false,
        isDerived: true,
        sourceTableColumnName: null,
        dependsOn: null,
      }
  const candidates = existing
    ? fields.map((candidate) =>
        candidate.tableColumnName === input.columnName ? draft : candidate
      )
    : [...fields, draft]
  const compiled = compileBaseFormula(draft, candidates)
  const resolvedDraft: BaseFieldInfo = {
    ...draft,
    property: {
      ...draft.property,
      expression: compiled.expression,
    },
    dependsOn: compiled.dependencies,
  }
  const resolved = candidates.map((candidate) =>
    candidate.tableColumnName === input.columnName ? resolvedDraft : candidate
  )
  compileBaseFormulaFields(resolved)
  return resolved
}

function localFormulaPreview(
  field: BaseFieldInfo | null,
  fields: BaseFieldInfo[],
  input: BaseFormulaPreviewInput
): BaseFormulaPreview {
  const resolved = formulaDraftFields(field, fields, input)
  const draft = resolved.find(
    (candidate) => candidate.tableColumnName === input.columnName
  )
  if (!draft || typeof draft.property?.expression !== "string") {
    throw new Error("Unable to compile formula")
  }
  const dependencies = Array.isArray(draft.dependsOn)
    ? draft.dependsOn.flatMap((columnName) => {
        if (typeof columnName !== "string") return []
        const dependency = resolved.find(
          (candidate) => candidate.tableColumnName === columnName
        )
        return [
          {
            name: dependency?.name ?? columnName,
            columnName,
          },
        ]
      })
    : []
  return {
    expression: draft.property.expression,
    dependencies,
    samples: [],
  }
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unable to validate formula"
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

function displayValue(value: BaseRowValue): string {
  if (value === null) return "Null"
  if (typeof value === "boolean") return value ? "True" : "False"
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function completionColumns(fields: BaseFieldInfo[]): UiColumn[] {
  return fields
    .filter((field) => !field.isHidden)
    .map((field) => ({
      name: field.tableColumnName,
      type: field.type,
      info:
        field.name === field.tableColumnName
          ? field.type
          : `${field.name} · ${field.type}`,
    }))
}

export interface BaseFormulaComposerProps {
  field: BaseFieldInfo | null
  fields: BaseFieldInfo[]
  name: string
  columnName: string
  formula: string
  displayType: BaseFormulaDisplayType
  editorRef?: RefObject<CodeMirrorFormulaEditorRef>
  onFormulaChange: (formula: string) => void
  onDisplayTypeChange: (displayType: BaseFormulaDisplayType) => void
  onPreview?: (input: BaseFormulaPreviewInput) => Promise<BaseFormulaPreview>
  onValidityChange?: (valid: boolean) => void
  onEscape?: () => void
  onSaveShortcut?: () => void
  disabled?: boolean
}

export function BaseFormulaComposer({
  field,
  fields,
  name,
  columnName,
  formula,
  displayType,
  editorRef: externalEditorRef,
  onFormulaChange,
  onDisplayTypeChange,
  onPreview,
  onValidityChange,
  onEscape,
  onSaveShortcut,
  disabled = false,
}: BaseFormulaComposerProps) {
  const internalEditorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const editorRef = externalEditorRef ?? internalEditorRef
  const validationSequence = useRef(0)
  const saveShortcutRef = useRef(onSaveShortcut)
  const [status, setStatus] = useState<FormulaStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<BaseFormulaPreview | null>(null)
  const [referenceQuery, setReferenceQuery] = useState("")
  const [selectedReference, setSelectedReference] = useState<string | null>(
    null
  )
  const columns = useMemo(() => completionColumns(fields), [fields])
  const completions = useMemo(() => getCompletions(columns, []), [columns])
  const visibleCompletions = useMemo(() => {
    const query = referenceQuery.trim().toLowerCase()
    return query
      ? completions.filter(
          (completion) =>
            completion.label.toLowerCase().includes(query) ||
            (typeof completion.info === "string" &&
              completion.info.toLowerCase().includes(query))
        )
      : completions
  }, [completions, referenceQuery])
  const selectedCompletion =
    completions.find((completion) => completion.label === selectedReference) ??
    null

  useEffect(() => {
    saveShortcutRef.current = onSaveShortcut
  }, [onSaveShortcut])

  useEffect(() => {
    const sequence = ++validationSequence.current
    const trimmedFormula = formula.trim()
    if (!trimmedFormula || !name.trim() || !columnName) {
      setStatus("idle")
      setError(null)
      setPreview(null)
      onValidityChange?.(false)
      return
    }
    const input: BaseFormulaPreviewInput = {
      name: name.trim(),
      columnName,
      formula: trimmedFormula,
      displayType,
    }
    let localPreview: BaseFormulaPreview
    try {
      localPreview = localFormulaPreview(field, fields, input)
      setPreview(localPreview)
      setError(null)
    } catch (validationError) {
      setStatus("error")
      setError(errorMessage(validationError))
      setPreview(null)
      onValidityChange?.(false)
      return
    }
    if (!onPreview) {
      setStatus("valid")
      onValidityChange?.(true)
      return
    }
    setStatus("checking")
    onValidityChange?.(false)
    const timer = window.setTimeout(() => {
      void onPreview(input)
        .then((result) => {
          if (validationSequence.current !== sequence) return
          setPreview(result)
          setStatus("valid")
          setError(null)
          onValidityChange?.(true)
        })
        .catch((previewError) => {
          if (validationSequence.current !== sequence) return
          setStatus("error")
          setError(errorMessage(previewError))
          setPreview(localPreview)
          onValidityChange?.(false)
        })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [
    columnName,
    displayType,
    field,
    fields,
    formula,
    name,
    onPreview,
    onValidityChange,
  ])

  const insertCompletion = (label: string, type: string) => {
    if (disabled) return
    editorRef.current?.insertText(type === "function" ? `${label}()` : label)
    setSelectedReference(label)
  }

  return (
    <div className="base-formula-composer min-h-0" aria-busy={disabled}>
      <div className="base-formula-composer-layout min-h-0">
        <div className="base-formula-editor-pane min-w-0 border-r">
          <div className="p-3">
            <CodeMirrorFormulaEditor
              ref={editorRef}
              value={formula}
              columns={columns}
              onChange={onFormulaChange}
              onEsc={onEscape}
              onSave={() => saveShortcutRef.current?.()}
              height="126px"
              placeholder='Use columns such as quantity, or prop("Display name")'
              disabled={disabled}
            />
          </div>

          <div
            className={cn(
              "flex min-h-10 items-start gap-2 border-t px-3 py-2 text-xs",
              status === "error" && "text-destructive"
            )}
            aria-live="polite"
          >
            {status === "checking" ? (
              <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            ) : status === "valid" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : status === "error" ? (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <FunctionSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              {status === "checking" ? (
                <span>Checking against this Base…</span>
              ) : status === "error" ? (
                <span role="alert">{error}</span>
              ) : status === "valid" ? (
                <>
                  <span>Formula is valid.</span>
                  {preview?.dependencies.length ? (
                    <span className="ml-1 text-muted-foreground">
                      Uses{" "}
                      {preview.dependencies.map((item) => item.name).join(", ")}
                      .
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Start typing to validate and preview this formula.
                </span>
              )}
            </div>
          </div>

          <div className="border-t">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-medium">Preview</p>
              <p className="text-[11px] text-muted-foreground">First 3 rows</p>
            </div>
            <div className="min-h-24 border-t">
              {preview?.samples.length ? (
                preview.samples.map((sample) => (
                  <div
                    key={sample.rowId}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.8fr)] gap-3 border-b px-3 py-2 text-xs last:border-b-0"
                  >
                    <span className="truncate text-muted-foreground">
                      {sample.title || "Untitled"}
                    </span>
                    <span className="truncate text-right font-medium">
                      {displayValue(sample.value)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex min-h-24 items-center px-3 text-xs text-muted-foreground">
                  {status === "valid"
                    ? "This table has no rows to preview."
                    : "A valid formula will show sample results here."}
                </div>
              )}
            </div>
          </div>

          <div className="base-formula-display-row flex items-center justify-between border-t px-3 py-2.5">
            <div>
              <p className="text-xs font-medium">Display as</p>
              <p className="text-[11px] text-muted-foreground">
                Controls the readonly Grid cell.
              </p>
            </div>
            <Select
              value={displayType}
              disabled={disabled}
              onValueChange={(value) =>
                onDisplayTypeChange(value as BaseFormulaDisplayType)
              }
            >
              <SelectTrigger className="base-formula-display-select h-8 text-xs">
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
          </div>
        </div>

        <aside className="base-formula-reference-pane flex min-h-0 flex-col bg-muted/15">
          <div className="border-b p-2.5">
            <p className="mb-2 text-xs font-medium">Fields & functions</p>
            <Input
              type="search"
              value={referenceQuery}
              placeholder="Filter references"
              className="h-7 text-xs"
              disabled={disabled}
              onChange={(event) => setReferenceQuery(event.target.value)}
            />
          </div>
          <div className="base-formula-reference-list flex-1 overflow-y-auto py-1">
            {visibleCompletions.map((completion) => (
              <button
                key={`${completion.type}-${completion.label}`}
                type="button"
                disabled={disabled}
                className={cn(
                  "flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-accent",
                  selectedReference === completion.label && "bg-accent"
                )}
                onMouseEnter={() => setSelectedReference(completion.label)}
                onClick={() =>
                  insertCompletion(completion.label, completion.type)
                }
              >
                {completion.type === "variable" ? (
                  <Variable className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FunctionSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px]">
                    {completion.label}
                  </span>
                  {typeof completion.info === "string" ? (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {completion.info}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="base-formula-reference-detail mt-auto min-h-16 border-t px-2.5 py-2 text-[11px] text-muted-foreground">
            {selectedCompletion ? (
              <>
                <p className="font-medium text-foreground">
                  {selectedCompletion.label}
                </p>
                <p className="mt-0.5 line-clamp-2">
                  {typeof selectedCompletion.info === "string"
                    ? selectedCompletion.info
                    : "detail" in selectedCompletion
                      ? typeof selectedCompletion.detail === "string"
                        ? selectedCompletion.detail
                        : selectedCompletion.type
                      : selectedCompletion.type}
                </p>
              </>
            ) : (
              <p>
                Select a reference to inspect it, or type to use autocomplete.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
