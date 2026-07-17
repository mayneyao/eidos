import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import type {
  BaseCsvFieldType,
  BaseCsvImportOptions,
  BaseCsvImportPlan,
} from "@eidos.space/base"
import { AlertTriangle, FileUp, LoaderCircle, Table2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import {
  BaseCsvOperationProgressBar,
  type BaseCsvOperationProgress,
} from "./base-csv-operation-progress"

type CsvSelection =
  | { canceled: true; token: null; fileName: null }
  | { canceled: false; token: string; fileName: string }

export interface BaseCsvImportPopoverProps {
  disabled?: boolean
  triggerVariant?: "workbar" | "empty-state" | "sheet-create"
  onSelect: () => Promise<CsvSelection>
  onPreview: (
    token: string,
    options: BaseCsvImportOptions,
    operationId: string
  ) => Promise<BaseCsvImportPlan>
  onImport: (
    token: string,
    options: BaseCsvImportOptions,
    operationId: string
  ) => Promise<void>
  onProgress: (operationId: string) => Promise<BaseCsvOperationProgress | null>
  onCancel: (operationId: string) => Promise<boolean>
  onImported?: () => void
}

interface CsvColumnDraft {
  sourceIndex: number
  name: string
  type: "title" | BaseCsvFieldType
}

const FIELD_TYPES: Array<{ value: BaseCsvFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "url", label: "URL" },
]

function newOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `csv-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function isCanceledError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes("cancel")
  )
}

function progressPercent(progress: BaseCsvOperationProgress | null): number {
  if (!progress || progress.totalBytes <= 0) return 0
  return Math.max(
    0,
    Math.min(
      100,
      Math.round((progress.processedBytes / progress.totalBytes) * 100)
    )
  )
}

function draftsFromPlan(plan: BaseCsvImportPlan): CsvColumnDraft[] {
  return plan.columns.map((column) => ({
    sourceIndex: column.sourceIndex,
    name: column.name,
    type: column.type,
  }))
}

export function BaseCsvImportPopover({
  disabled = false,
  triggerVariant = "workbar",
  onSelect,
  onPreview,
  onImport,
  onProgress,
  onCancel,
  onImported,
}: BaseCsvImportPopoverProps) {
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [plan, setPlan] = useState<BaseCsvImportPlan | null>(null)
  const [tableName, setTableName] = useState("")
  const [columns, setColumns] = useState<CsvColumnDraft[]>([])
  const [validating, setValidating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BaseCsvOperationProgress | null>(
    null
  )
  const previewSequence = useRef(0)
  const activeOperation = useRef<string | null>(null)
  const validatedTypes = useRef("")
  const pausedTypes = useRef("")
  const planReady = plan !== null
  const typeSignature = columns.map((column) => column.type).join("\u0000")
  const typesValidated = validatedTypes.current === typeSignature
  const namesValid =
    Boolean(tableName.trim()) && columns.every((column) => column.name.trim())

  const options = useMemo<BaseCsvImportOptions>(
    () => ({
      tableName,
      columns: columns.map((column) => ({
        sourceIndex: column.sourceIndex,
        name: column.name,
        ...(column.type === "title" ? {} : { type: column.type }),
      })),
    }),
    [columns, tableName]
  )
  const optionsRef = useRef(options)
  optionsRef.current = options
  const namingError = namesValid
    ? null
    : "Table and field names cannot be empty"
  const displayedError = namingError ?? error
  const busy = selecting || validating || importing

  const startPreview = useCallback(
    async (
      nextToken: string,
      previewOptions: BaseCsvImportOptions,
      initialize: boolean
    ) => {
      const previousOperation = activeOperation.current
      if (previousOperation) void onCancel(previousOperation)
      const sequence = ++previewSequence.current
      const nextOperationId = newOperationId()
      activeOperation.current = nextOperationId
      setOperationId(nextOperationId)
      setProgress(null)
      setValidating(true)
      setCanceling(false)
      setError(null)
      setNotice(null)
      pausedTypes.current = ""
      try {
        const nextPlan = await onPreview(
          nextToken,
          previewOptions,
          nextOperationId
        )
        if (previewSequence.current !== sequence) return
        setPlan(nextPlan)
        if (initialize) {
          setTableName(nextPlan.tableName)
          setColumns(draftsFromPlan(nextPlan))
        }
        validatedTypes.current = nextPlan.columns
          .map((column) => column.type)
          .join("\u0000")
      } catch (previewError) {
        if (previewSequence.current !== sequence) return
        if (isCanceledError(previewError)) {
          if (!initialize) {
            pausedTypes.current =
              previewOptions.columns
                ?.map((column) => column.type ?? "title")
                .join("\u0000") ?? ""
          }
          setNotice("CSV analysis canceled. Choose another file or try again.")
        } else {
          setError(
            previewError instanceof Error
              ? previewError.message
              : "Unable to validate CSV"
          )
        }
      } finally {
        if (previewSequence.current === sequence) {
          activeOperation.current = null
          setOperationId(null)
          setValidating(false)
          setCanceling(false)
        }
      }
    },
    [onCancel, onPreview]
  )

  const chooseFile = async () => {
    if (disabled || busy) return
    setSelecting(true)
    setError(null)
    setNotice(null)
    try {
      const selection = await onSelect()
      if (selection.canceled) return
      setToken(selection.token)
      setSourceFileName(selection.fileName)
      setPlan(null)
      setTableName("")
      setColumns([])
      setOpen(true)
      void startPreview(selection.token, {}, true)
    } catch (selectionError) {
      setToken(null)
      setSourceFileName(null)
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to select CSV"
      )
      setOpen(true)
    } finally {
      setSelecting(false)
    }
  }

  useEffect(() => {
    if (!operationId) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const nextProgress = await onProgress(operationId)
        if (disposed) return
        if (nextProgress) setProgress(nextProgress)
      } catch {
        // The operation promise owns the user-facing error state.
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 120)
    }
    void poll()
    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
    }
  }, [onProgress, operationId])

  useEffect(
    () => () => {
      if (activeOperation.current) void onCancel(activeOperation.current)
    },
    [onCancel]
  )

  useEffect(() => {
    if (!open || !token || !planReady) return
    if (!namesValid) {
      previewSequence.current += 1
      if (activeOperation.current) {
        void onCancel(activeOperation.current)
        activeOperation.current = null
        setOperationId(null)
      }
      setValidating(false)
      setCanceling(false)
      return
    }
    if (validatedTypes.current === typeSignature) {
      setValidating(false)
      setError(null)
      return
    }
    if (pausedTypes.current === typeSignature) {
      setValidating(false)
      return
    }
    const timeout = window.setTimeout(() => {
      void startPreview(token, optionsRef.current, false)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [
    namesValid,
    onCancel,
    open,
    planReady,
    startPreview,
    token,
    typeSignature,
  ])

  const cancelOperation = async () => {
    const currentOperation = activeOperation.current
    if (!currentOperation || canceling) return
    setCanceling(true)
    setNotice("Canceling CSV operation…")
    const canceled = await onCancel(currentOperation).catch(() => false)
    if (!canceled) {
      setCanceling(false)
      setNotice(null)
      setError("Unable to cancel CSV operation")
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      !token ||
      !plan ||
      importing ||
      validating ||
      !typesValidated ||
      displayedError
    ) {
      return
    }
    const nextOperationId = newOperationId()
    activeOperation.current = nextOperationId
    setOperationId(nextOperationId)
    setProgress(null)
    setImporting(true)
    setCanceling(false)
    setError(null)
    setNotice(null)
    try {
      await onImport(token, options, nextOperationId)
      setOpen(false)
      setToken(null)
      setSourceFileName(null)
      setPlan(null)
      onImported?.()
    } catch (importError) {
      if (isCanceledError(importError)) {
        setNotice("Import canceled. No rows were added.")
      } else {
        setError(
          importError instanceof Error
            ? importError.message
            : "Unable to import CSV"
        )
      }
    } finally {
      if (activeOperation.current === nextOperationId) {
        activeOperation.current = null
        setOperationId(null)
      }
      setImporting(false)
      setCanceling(false)
    }
  }

  const percent = progressPercent(progress)
  const operationLabel = canceling
    ? "Canceling…"
    : progress?.phase === "finalizing"
      ? "Finalizing table…"
      : progress?.phase === "importing" || importing
        ? `Importing rows… ${percent}%`
        : `Analyzing CSV… ${percent}%`
  const operationDetail = progress
    ? progress.totalRows !== null
      ? `${progress.processedRows.toLocaleString()} of ${progress.totalRows.toLocaleString()} rows`
      : `${progress.processedRows.toLocaleString()} rows read`
    : sourceFileName

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (validating || importing) return
        setOpen(nextOpen)
        if (!nextOpen) {
          setError(null)
          setNotice(null)
        }
      }}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant={triggerVariant === "empty-state" ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "gap-1.5 text-xs",
            triggerVariant === "empty-state"
              ? "h-8 px-3"
              : triggerVariant === "sheet-create"
                ? "h-auto w-full items-start justify-start gap-3 rounded-md px-3 py-2.5 text-left"
                : "base-workbar-action h-7 px-2"
          )}
          aria-label={
            triggerVariant === "sheet-create"
              ? "Import CSV as new Base table"
              : "Import CSV into Base"
          }
          title="Import CSV"
          disabled={disabled || selecting}
          onClick={() => void chooseFile()}
        >
          {selecting ? (
            <LoaderCircle
              className={cn(
                "h-3.5 w-3.5 animate-spin motion-reduce:animate-none",
                triggerVariant === "sheet-create" && "mt-0.5"
              )}
            />
          ) : (
            <FileUp
              className={cn(
                "h-3.5 w-3.5",
                triggerVariant === "sheet-create" && "mt-0.5"
              )}
            />
          )}
          {triggerVariant === "sheet-create" ? (
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium text-foreground">
                Import CSV
              </span>
              <span className="text-xs font-normal leading-4 text-muted-foreground">
                Create a table from a CSV file.
              </span>
            </span>
          ) : (
            <span
              className={cn(
                triggerVariant === "workbar" && "base-workbar-action-label"
              )}
            >
              Import CSV
            </span>
          )}
        </Button>
      </PopoverAnchor>
      <PopoverContent
        align={
          triggerVariant === "empty-state"
            ? "center"
            : triggerVariant === "sheet-create"
              ? "start"
              : "end"
        }
        side={triggerVariant === "sheet-create" ? "top" : "bottom"}
        sideOffset={5}
        className="w-[min(760px,calc(100vw-24px))] p-0"
      >
        {plan && token ? (
          <form onSubmit={(event) => void submit(event)}>
            <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  Import as a new table
                </h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {plan.fileName} · {plan.rowCount.toLocaleString()} ready
                  {plan.skippedRowCount > 0
                    ? ` · ${plan.skippedRowCount.toLocaleString()} skipped`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                disabled={busy}
                onClick={() => void chooseFile()}
              >
                Choose another
              </Button>
            </div>

            <div className="max-h-[min(68vh,620px)] overflow-y-auto">
              <div className="grid gap-1.5 border-b px-4 py-3">
                <label
                  htmlFor="base-csv-table-name"
                  className="text-xs font-medium"
                >
                  Table name
                </label>
                <Input
                  id="base-csv-table-name"
                  value={tableName}
                  className="h-8"
                  disabled={importing}
                  onChange={(event) => setTableName(event.target.value)}
                />
              </div>

              <div className="border-b">
                <div className="grid grid-cols-[minmax(140px,1fr)_140px] gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Field name</span>
                  <span>Type</span>
                </div>
                <div className="max-h-52 overflow-y-auto px-2 pb-2">
                  {columns.map((column, index) => (
                    <div
                      key={column.sourceIndex}
                      className="grid grid-cols-[minmax(140px,1fr)_140px] items-center gap-3 rounded px-2 py-1 hover:bg-muted/35"
                    >
                      <Input
                        value={column.name}
                        aria-label={`Field ${index + 1} name`}
                        className="h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input"
                        disabled={importing}
                        onChange={(event) =>
                          setColumns((current) =>
                            current.map((candidate) =>
                              candidate.sourceIndex === column.sourceIndex
                                ? { ...candidate, name: event.target.value }
                                : candidate
                            )
                          )
                        }
                      />
                      {column.type === "title" ? (
                        <span className="px-2 text-xs text-muted-foreground">
                          Title
                        </span>
                      ) : (
                        <select
                          value={column.type}
                          aria-label={`${column.name || `Field ${index + 1}`} type`}
                          className="h-7 rounded-md border bg-background px-2 text-xs outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          disabled={importing}
                          onChange={(event) =>
                            setColumns((current) =>
                              current.map((candidate) =>
                                candidate.sourceIndex === column.sourceIndex
                                  ? {
                                      ...candidate,
                                      type: event.target
                                        .value as BaseCsvFieldType,
                                    }
                                  : candidate
                              )
                            )
                          }
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-medium">Preview</h3>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[11px] text-muted-foreground",
                      displayedError && "text-destructive"
                    )}
                  >
                    {validating ? (
                      <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                    ) : displayedError ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : null}
                    {validating
                      ? operationLabel
                      : displayedError || notice || "Ready to import"}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-muted/45 text-left text-muted-foreground">
                      <tr>
                        {columns.map((column) => (
                          <th
                            key={column.sourceIndex}
                            className="max-w-56 border-r px-2.5 py-1.5 font-medium last:border-r-0"
                          >
                            <span className="block truncate">
                              {column.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.sampleRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                          {columns.map((column) => (
                            <td
                              key={column.sourceIndex}
                              className="max-w-56 border-r px-2.5 py-1.5 last:border-r-0"
                            >
                              <span className="block truncate text-foreground/85">
                                {row[column.sourceIndex] || (
                                  <span className="text-muted-foreground/60">
                                    Empty
                                  </span>
                                )}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {plan.issues.length > 0 ? (
                  <div className="mt-2 space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
                    {plan.issues.map((issue) => (
                      <p key={issue.code}>{issue.message}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-14 items-center justify-between gap-4 border-t px-4 py-2.5">
              <div className="min-w-0 flex-1">
                {validating || importing ? (
                  <BaseCsvOperationProgressBar
                    label={operationLabel}
                    detail={operationDetail}
                    percent={percent}
                    size="compact"
                  />
                ) : notice ? (
                  <p className="text-[11px] text-muted-foreground">{notice}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {validating || importing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={canceling}
                    onClick={() => void cancelOperation()}
                  >
                    {canceling ? "Canceling…" : "Cancel operation"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                )}
                {!typesValidated && !validating && plan ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void startPreview(token, options, false)}
                  >
                    Retry check
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      importing ||
                      validating ||
                      !typesValidated ||
                      Boolean(displayedError) ||
                      !namesValid
                    }
                  >
                    {importing ? (
                      <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    ) : null}
                    {importing
                      ? `Importing ${percent}%`
                      : `Import ${plan.rowCount.toLocaleString()} rows`}
                  </Button>
                )}
              </div>
            </div>
          </form>
        ) : token ? (
          <div>
            <div className="border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                Analyze CSV
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {sourceFileName}
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              {validating ? (
                <BaseCsvOperationProgressBar
                  label={operationLabel}
                  detail={operationDetail}
                  percent={percent}
                />
              ) : (
                <p
                  className={cn(
                    "text-xs text-muted-foreground",
                    error && "text-destructive"
                  )}
                >
                  {error || notice || "CSV analysis did not finish."}
                </p>
              )}
              <div className="flex justify-end gap-2">
                {validating ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={canceling}
                    onClick={() => void cancelOperation()}
                  >
                    {canceling ? "Canceling…" : "Cancel analysis"}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void chooseFile()}
                    >
                      Choose another
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void startPreview(token, {}, true)}
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-xs text-destructive">
            {error ?? "Choose a CSV file to continue"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
