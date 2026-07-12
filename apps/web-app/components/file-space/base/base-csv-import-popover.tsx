import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
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

type CsvSelection =
  | { canceled: true; token: null; plan: null }
  | { canceled: false; token: string; plan: BaseCsvImportPlan }

interface BaseCsvImportPopoverProps {
  disabled?: boolean
  onSelect: () => Promise<CsvSelection>
  onPreview: (
    token: string,
    options: BaseCsvImportOptions
  ) => Promise<BaseCsvImportPlan>
  onImport: (token: string, options: BaseCsvImportOptions) => Promise<void>
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

function draftsFromPlan(plan: BaseCsvImportPlan): CsvColumnDraft[] {
  return plan.columns.map((column) => ({
    sourceIndex: column.sourceIndex,
    name: column.name,
    type: column.type,
  }))
}

export function BaseCsvImportPopover({
  disabled = false,
  onSelect,
  onPreview,
  onImport,
}: BaseCsvImportPopoverProps) {
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [plan, setPlan] = useState<BaseCsvImportPlan | null>(null)
  const [tableName, setTableName] = useState("")
  const [columns, setColumns] = useState<CsvColumnDraft[]>([])
  const [validating, setValidating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewSequence = useRef(0)
  const validatedTypes = useRef("")
  const planReady = plan !== null
  const typeSignature = columns.map((column) => column.type).join("\u0000")
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

  const chooseFile = async () => {
    if (disabled || selecting || importing) return
    setSelecting(true)
    setError(null)
    try {
      const selection = await onSelect()
      if (selection.canceled) return
      setToken(selection.token)
      setPlan(selection.plan)
      setTableName(selection.plan.tableName)
      setColumns(draftsFromPlan(selection.plan))
      validatedTypes.current = selection.plan.columns
        .map((column) => column.type)
        .join("\u0000")
      setOpen(true)
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to read CSV"
      )
      setOpen(true)
    } finally {
      setSelecting(false)
    }
  }

  useEffect(() => {
    if (!open || !token || !planReady) return
    if (!namesValid) {
      previewSequence.current += 1
      setValidating(false)
      return
    }
    if (validatedTypes.current === typeSignature) {
      setValidating(false)
      setError(null)
      return
    }
    const sequence = ++previewSequence.current
    setValidating(true)
    const timeout = window.setTimeout(() => {
      void onPreview(token, optionsRef.current).then(
        (nextPlan) => {
          if (previewSequence.current !== sequence) return
          validatedTypes.current = typeSignature
          setPlan(nextPlan)
          setError(null)
          setValidating(false)
        },
        (previewError) => {
          if (previewSequence.current !== sequence) return
          setError(
            previewError instanceof Error
              ? previewError.message
              : "Unable to validate CSV"
          )
          setValidating(false)
        }
      )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [namesValid, onPreview, open, planReady, token, typeSignature])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token || !plan || importing || validating || displayedError) return
    setImporting(true)
    setError(null)
    try {
      await onImport(token, options)
      setOpen(false)
      setToken(null)
      setPlan(null)
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import CSV"
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (importing) return
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={disabled || selecting}
          onClick={() => void chooseFile()}
        >
          {selecting ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
          Import CSV
        </Button>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
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
                disabled={importing}
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
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                    ) : displayedError ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : null}
                    {validating
                      ? "Checking types…"
                      : displayedError || "Ready to import"}
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

            <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={importing}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  importing ||
                  validating ||
                  Boolean(displayedError) ||
                  !namesValid
                }
              >
                {importing ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {importing
                  ? "Importing…"
                  : `Import ${plan.rowCount.toLocaleString()} rows`}
              </Button>
            </div>
          </form>
        ) : (
          <div className="px-4 py-3 text-xs text-destructive">
            {error ?? "Choose a CSV file to continue"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
