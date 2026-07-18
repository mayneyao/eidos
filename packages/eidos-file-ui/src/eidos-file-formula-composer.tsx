import { useEffect, useMemo, useRef, useState } from "react"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
  type EidosFileFieldInfo,
  type EidosFileFormulaDisplayType,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileRowValue,
} from "@eidos.space/eidos-file"
import {
  AlertCircle,
  Check,
  FunctionSquare,
  LoaderCircle,
  Variable,
} from "lucide-react"

import { cn } from "./lib/cn"
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "./ui/primitives"

const DISPLAY_TYPES: Array<{
  value: EidosFileFormulaDisplayType
  label: string
}> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "url", label: "URL" },
]

const FORMULA_FUNCTIONS = [
  "abs",
  "coalesce",
  "date",
  "datetime",
  "ifnull",
  "iif",
  "length",
  "lower",
  "max",
  "min",
  "nullif",
  "replace",
  "round",
  "strftime",
  "substr",
  "trim",
  "typeof",
  "upper",
] as const

type FormulaStatus = "idle" | "checking" | "valid" | "error"

function draftFormulaPreview(
  field: EidosFileFieldInfo | null,
  fields: EidosFileFieldInfo[],
  input: EidosFileFormulaPreviewInput
): EidosFileFormulaPreview {
  const existing =
    field ??
    fields.find(
      (candidate) => candidate.tableColumnName === input.columnName
    ) ??
    null
  const draft: EidosFileFieldInfo = existing
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
  const compiled = compileEidosFileFormula(draft, candidates)
  const resolvedDraft: EidosFileFieldInfo = {
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
  compileEidosFileFormulaFields(resolved)
  return {
    expression: compiled.expression,
    dependencies: compiled.dependencies.map((columnName) => {
      const dependency = resolved.find(
        (candidate) => candidate.tableColumnName === columnName
      )
      return { name: dependency?.name ?? columnName, columnName }
    }),
    samples: [],
  }
}

function formulaError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unable to validate formula")
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

function displayValue(value: EidosFileRowValue): string {
  if (value === null) return "Null"
  if (typeof value === "boolean") return value ? "True" : "False"
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

export interface EidosFileFormulaComposerProps {
  field: EidosFileFieldInfo | null
  fields: EidosFileFieldInfo[]
  name: string
  columnName: string
  formula: string
  displayType: EidosFileFormulaDisplayType
  onFormulaChange: (formula: string) => void
  onDisplayTypeChange: (displayType: EidosFileFormulaDisplayType) => void
  onPreview?: (
    input: EidosFileFormulaPreviewInput
  ) => Promise<EidosFileFormulaPreview>
  onValidityChange?: (valid: boolean) => void
  onEscape?: () => void
  onSaveShortcut?: () => void
  disabled?: boolean
}

export function EidosFileFormulaComposer({
  field,
  fields,
  name,
  columnName,
  formula,
  displayType,
  onFormulaChange,
  onDisplayTypeChange,
  onPreview,
  onValidityChange,
  onEscape,
  onSaveShortcut,
  disabled = false,
}: EidosFileFormulaComposerProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const validationSequence = useRef(0)
  const [status, setStatus] = useState<FormulaStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EidosFileFormulaPreview | null>(null)
  const [referenceQuery, setReferenceQuery] = useState("")
  const references = useMemo(() => {
    const needle = referenceQuery.trim().toLowerCase()
    const fieldReferences = fields
      .filter(
        (candidate) =>
          !candidate.isHidden &&
          candidate.tableColumnName !== columnName &&
          (!needle ||
            candidate.name.toLowerCase().includes(needle) ||
            candidate.tableColumnName.toLowerCase().includes(needle))
      )
      .map((candidate) => ({
        id: `field:${candidate.tableColumnName}`,
        label: candidate.name,
        detail: candidate.type,
        insert: `prop(${JSON.stringify(candidate.name)})`,
        kind: "field" as const,
      }))
    const functions = FORMULA_FUNCTIONS.filter(
      (candidate) => !needle || candidate.includes(needle)
    ).map((candidate) => ({
      id: `function:${candidate}`,
      label: candidate,
      detail: "function",
      insert: `${candidate}()`,
      kind: "function" as const,
    }))
    return [...fieldReferences, ...functions]
  }, [columnName, fields, referenceQuery])

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
    const input: EidosFileFormulaPreviewInput = {
      name: name.trim(),
      columnName,
      formula: trimmedFormula,
      displayType,
    }
    let local: EidosFileFormulaPreview
    try {
      local = draftFormulaPreview(field, fields, input)
      setPreview(local)
      setError(null)
    } catch (validationError) {
      setStatus("error")
      setError(formulaError(validationError))
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
          setPreview(local)
          setStatus("error")
          setError(formulaError(previewError))
          onValidityChange?.(false)
        })
    }, 300)
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

  const insertReference = (text: string) => {
    const editor = editorRef.current
    if (!editor) {
      onFormulaChange(`${formula}${text}`)
      return
    }
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const cursorOffset = text.endsWith("()") ? text.length - 1 : text.length
    onFormulaChange(`${formula.slice(0, start)}${text}${formula.slice(end)}`)
    requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionRange(start + cursorOffset, start + cursorOffset)
    })
  }

  return (
    <div className="min-h-0" aria-busy={disabled ? "true" : undefined}>
      <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 md:border-r">
          <div className="p-3">
            <Textarea
              ref={editorRef}
              value={formula}
              disabled={disabled}
              rows={5}
              spellCheck={false}
              className="min-h-32 resize-y font-mono text-xs leading-5"
              placeholder={'Use a column name or prop("Display name")'}
              aria-label="Formula expression"
              onChange={(event) => onFormulaChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onEscape?.()
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  onSaveShortcut?.()
                }
              }}
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
            <span>
              {status === "checking"
                ? "Checking against this Eidos File…"
                : status === "error"
                  ? error
                  : status === "valid"
                    ? `Formula is valid.${preview?.dependencies.length ? ` Uses ${preview.dependencies.map((item) => item.name).join(", ")}.` : ""}`
                    : "Start typing to validate and preview this formula."}
            </span>
          </div>
          <div className="border-t">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-medium">Preview</p>
              <p className="text-[10px] text-muted-foreground">First 3 rows</p>
            </div>
            <div className="min-h-20 border-t">
              {preview?.samples.length ? (
                preview.samples.map((sample) => (
                  <div
                    key={sample.rowId}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.7fr)] gap-3 border-b px-3 py-2 text-xs last:border-b-0"
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
                <div className="flex min-h-20 items-center px-3 text-xs text-muted-foreground">
                  {status === "valid"
                    ? "This table has no rows to preview."
                    : "A valid formula will show sample results here."}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
            <div>
              <p className="text-xs font-medium">Display as</p>
              <p className="text-[10px] text-muted-foreground">
                Controls the read-only cell format.
              </p>
            </div>
            <Select
              value={displayType}
              disabled={disabled}
              onValueChange={(value) =>
                onDisplayTypeChange(value as EidosFileFormulaDisplayType)
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
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

        <aside className="flex min-h-48 flex-col border-t bg-muted/15 md:border-t-0">
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
          <div className="max-h-64 flex-1 overflow-y-auto py-1 md:max-h-none">
            {references.map((reference) => (
              <button
                key={reference.id}
                type="button"
                disabled={disabled}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => insertReference(reference.insert)}
              >
                {reference.kind === "field" ? (
                  <Variable className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FunctionSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px]">
                    {reference.label}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {reference.detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
