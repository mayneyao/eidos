import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
  type EidosFileFieldInfo,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileFormulaResultType,
  type EidosFileRowValue,
} from "@eidos.space/eidos-file"
import {
  AlertCircle,
  Check,
  FunctionSquare,
  LoaderCircle,
  Variable,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import {
  eidosFileFieldTypeOptions,
  EidosFileFieldTypeIcon,
} from "./eidos-file-field-type-picker"
import {
  eidosFileFormulaCompletions,
  type EidosFileFormulaCompletion,
} from "./eidos-file-formula-completions"
import {
  EidosFileFormulaInput,
  type EidosFileFormulaInputRef,
} from "./eidos-file-formula-input"
import { cn } from "./lib/cn"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

export type { EidosFileFormulaInputRef }

const FORMULA_DISPLAY_TYPES = [
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
] as const satisfies readonly EidosFileFormulaResultType[]

const DISPLAY_TYPES = eidosFileFieldTypeOptions(FORMULA_DISPLAY_TYPES)

type FormulaStatus = "idle" | "checking" | "valid" | "error"

function formulaDraftFields(
  field: EidosFileFieldInfo | null,
  fields: EidosFileFieldInfo[],
  input: EidosFileFormulaPreviewInput
): EidosFileFieldInfo[] {
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
        property: { formula: input.formula, displayType: input.displayType },
        dependsOn: null,
      }
    : {
        id: `preview:${input.columnName}`,
        tableId: fields[0]?.tableId ?? "preview",
        name: input.name,
        type: "formula",
        tableName: fields[0]?.tableName ?? "Preview",
        tableColumnName: input.columnName,
        physicalName: null,
        isRecordLabel: false,
        position: fields.length,
        settings: {},
        property: { formula: input.formula, displayType: input.displayType },
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
    property: { ...draft.property, expression: compiled.expression },
    dependsOn: compiled.dependencies,
  }
  const resolved = candidates.map((candidate) =>
    candidate.tableColumnName === input.columnName ? resolvedDraft : candidate
  )
  compileEidosFileFormulaFields(resolved)
  return resolved
}

function localFormulaPreview(
  field: EidosFileFieldInfo | null,
  fields: EidosFileFieldInfo[],
  input: EidosFileFormulaPreviewInput
): EidosFileFormulaPreview {
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
        return [{ name: dependency?.name ?? columnName, columnName }]
      })
    : []
  return { expression: draft.property.expression, dependencies, samples: [] }
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
  displayType: EidosFileFormulaResultType
  editorRef?: RefObject<EidosFileFormulaInputRef>
  onFormulaChange: (formula: string) => void
  onDisplayTypeChange: (displayType: EidosFileFormulaResultType) => void
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
  editorRef: externalEditorRef,
  onFormulaChange,
  onDisplayTypeChange,
  onPreview,
  onValidityChange,
  onEscape,
  onSaveShortcut,
  disabled = false,
}: EidosFileFormulaComposerProps) {
  const { translate: t } = useEidosFileUI()
  const internalEditorRef = useRef<EidosFileFormulaInputRef>(null)
  const editorRef = externalEditorRef ?? internalEditorRef
  const validationSequence = useRef(0)
  const referenceNodes = useRef(new Map<string, HTMLButtonElement>())
  const [status, setStatus] = useState<FormulaStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EidosFileFormulaPreview | null>(null)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
    null
  )
  const completions = useMemo(
    () => eidosFileFormulaCompletions(fields, columnName),
    [columnName, fields]
  )
  const selectedCompletion =
    completions.find((completion) => completion.id === selectedReferenceId) ??
    null

  useEffect(() => {
    const timer = window.setTimeout(() => editorRef.current?.focus(), 100)
    return () => window.clearTimeout(timer)
  }, [editorRef])

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
    let localPreview: EidosFileFormulaPreview
    try {
      localPreview = localFormulaPreview(field, fields, input)
      setPreview(localPreview)
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
          setPreview(localPreview)
          setStatus("error")
          setError(formulaError(previewError))
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

  const selectToken = (token: string | null) => {
    if (!token) return
    const completion = completions.find(
      (candidate) =>
        candidate.label.toLowerCase() === token.toLowerCase() ||
        (candidate.kind === "field" &&
          candidate.id.toLowerCase().endsWith(`:${token.toLowerCase()}`))
    )
    if (!completion) return
    setSelectedReferenceId(completion.id)
    referenceNodes.current
      .get(completion.id)
      ?.scrollIntoView({ block: "nearest" })
  }

  const insertCompletion = (completion: EidosFileFormulaCompletion) => {
    if (disabled) return
    editorRef.current?.insertText(
      completion.insert,
      completion.cursorOffset ?? 0
    )
    setSelectedReferenceId(completion.id)
  }

  return (
    <div
      className="eidos-file-formula-composer min-h-0"
      aria-busy={disabled ? "true" : undefined}
      data-eidos-file-formula-composer
    >
      <section className="min-w-0">
        <div className="p-3">
          <EidosFileFormulaInput
            ref={editorRef}
            value={formula}
            completions={completions}
            disabled={disabled}
            onChange={onFormulaChange}
            onEscape={onEscape}
            onSave={onSaveShortcut}
            onCurrentTokenChange={selectToken}
            placeholder={t("Enter a Formula expression")}
          />
        </div>
        <div
          className={cn(
            "flex min-h-10 items-start gap-2 border-t px-3 py-2 text-xs",
            status === "error" && "text-destructive"
          )}
          aria-live="polite"
          data-eidos-file-formula-status={status}
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
          <span className="min-w-0 leading-5">
            {status === "checking"
              ? t("Checking against this Eidos File…")
              : status === "error"
                ? error
                : status === "valid"
                  ? preview?.samples[0]
                    ? t("Preview · {title}: {value}", {
                        title: preview.samples[0].title || t("Untitled"),
                        value: displayValue(preview.samples[0].value),
                      })
                    : `${t("Formula is valid.")}${
                        preview?.dependencies.length
                          ? ` ${t("Uses {fields}.", {
                              fields: preview.dependencies
                                .map((item) => item.name)
                                .join(", "),
                            })}`
                          : ""
                      }`
                  : t("Start typing to validate and preview this formula.")}
          </span>
        </div>
        <div className="eidos-file-formula-display-row flex items-center justify-between gap-3 border-t px-3 py-2.5">
          <div className="text-left">
            <p className="text-xs font-medium">{t("Display as")}</p>
            <p className="text-[10px] leading-4 text-muted-foreground">
              {t("Controls the read-only cell format.")}
            </p>
          </div>
          <Select
            value={displayType}
            disabled={disabled}
            onValueChange={(value) =>
              onDisplayTypeChange(value as EidosFileFormulaResultType)
            }
          >
            <SelectTrigger className="eidos-file-formula-display-select h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <span className="flex items-center gap-2">
                    <EidosFileFieldTypeIcon
                      type={type.value}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span>{t(type.label)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="eidos-file-formula-reference-browser grid border-t bg-muted/15">
        <div className="min-w-0 border-r">
          <p className="border-b px-3 py-2 text-xs font-medium">
            {t("Fields & functions")}
          </p>
          <div className="eidos-file-formula-reference-list overflow-y-auto py-1">
            {completions.length ? (
              completions.map((completion) => (
                <button
                  key={completion.id}
                  ref={(node) => {
                    if (node) referenceNodes.current.set(completion.id, node)
                    else referenceNodes.current.delete(completion.id)
                  }}
                  type="button"
                  disabled={disabled}
                  data-formula-reference={completion.id}
                  className={cn(
                    "flex min-h-8 w-full items-start gap-2 px-2.5 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                    selectedReferenceId === completion.id && "bg-accent"
                  )}
                  onMouseEnter={() => setSelectedReferenceId(completion.id)}
                  onFocus={() => setSelectedReferenceId(completion.id)}
                  onClick={() => insertCompletion(completion)}
                >
                  {completion.kind === "field" ? (
                    <Variable className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FunctionSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[11px]">
                      {completion.label}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {completion.info}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("No matching fields or functions.")}
              </p>
            )}
          </div>
        </div>
        <div className="eidos-file-formula-reference-detail min-w-0 p-3 text-xs text-muted-foreground">
          {selectedCompletion ? (
            <>
              <div className="flex items-center gap-2 text-foreground">
                {selectedCompletion.kind === "field" ? (
                  <Variable className="h-3.5 w-3.5" />
                ) : (
                  <FunctionSquare className="h-3.5 w-3.5" />
                )}
                <code className="font-mono text-xs font-medium">
                  {selectedCompletion.label}
                </code>
              </div>
              <p className="mt-2 leading-5">{selectedCompletion.info}</p>
              {selectedCompletion.example ? (
                <pre className="mt-3 overflow-x-auto rounded-md border bg-background px-2.5 py-2 font-mono text-[11px] text-foreground">
                  {selectedCompletion.example}
                </pre>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">{t("Reference")}</p>
              <p className="mt-2 leading-5">
                {t(
                  "Select a field or function to inspect it, or type in the editor to use autocomplete."
                )}
              </p>
            </>
          )}
        </div>
      </section>
      <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        {t("Press ⌘S or Ctrl+S to save. Escape closes the editor.")}
      </p>
    </div>
  )
}
