import { useEffect, useMemo, useState, type FormEvent } from "react"
import type {
  EidosFileCsvFieldType,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { AlertTriangle, FileUp, LoaderCircle, Table2 } from "lucide-react"

import { defineEidosFilePlugin, type EidosFilePluginContext } from "../plugin"
import { cn } from "../lib/cn"
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../ui/primitives"

export interface EidosFileCsvImportSource {
  id: string
  fileName: string
}

export interface EidosFileCsvImportAdapter {
  pickFile(): Promise<EidosFileCsvImportSource | null>
  preview(
    source: EidosFileCsvImportSource,
    options: EidosFileCsvImportOptions
  ): Promise<EidosFileCsvImportPlan>
  import(
    source: EidosFileCsvImportSource,
    options: EidosFileCsvImportOptions
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }>
  release?(source: EidosFileCsvImportSource): void
}

export interface EidosFileCsvImportPluginOptions {
  id?: string
  label?: string
  order?: number
  copy?: Partial<EidosFileCsvImportCopy>
}

export interface EidosFileCsvImportCopy {
  actionAriaLabel: string
  actionLabel: string
  cancel: string
  chooseAnother: string
  choosePrompt: string
  dialogTitle: string
  fieldName: string
  fieldType: string
  fileSummary: string
  importRows: string
  importing: string
  localOnly: string
  parsing: string
  preview: string
  tableName: string
  titleType: string
  typeCheckbox: string
  typeDate: string
  typeDatetime: string
  typeNumber: string
  typeText: string
  typeUrl: string
  unableToImport: string
  unableToRead: string
}

interface CsvColumnDraft {
  sourceIndex: number
  name: string
  type: "title" | EidosFileCsvFieldType
}

const FIELD_TYPES: EidosFileCsvFieldType[] = [
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "url",
]

const DEFAULT_COPY: EidosFileCsvImportCopy = {
  actionAriaLabel: "Import CSV as a new Eidos File table",
  actionLabel: "Import CSV",
  cancel: "Cancel",
  chooseAnother: "Choose another",
  choosePrompt: "Choose a CSV file to inspect it.",
  dialogTitle: "Import CSV as a new table",
  fieldName: "Field {index} name",
  fieldType: "{name} type",
  fileSummary: "{file} · {count} rows",
  importRows: "Import {count} rows",
  importing: "Importing…",
  localOnly: "CSV parsing and writes stay local to this editor.",
  parsing: "Parsing and inferring fields in the runtime worker…",
  preview: "Preview",
  tableName: "Table name",
  titleType: "Title",
  typeCheckbox: "Checkbox",
  typeDate: "Date",
  typeDatetime: "Date & time",
  typeNumber: "Number",
  typeText: "Text",
  typeUrl: "URL",
  unableToImport: "Unable to import CSV",
  unableToRead: "Unable to read CSV",
}

function fieldTypeLabel(
  type: EidosFileCsvFieldType,
  copy: EidosFileCsvImportCopy
): string {
  if (type === "number") return copy.typeNumber
  if (type === "checkbox") return copy.typeCheckbox
  if (type === "date") return copy.typeDate
  if (type === "datetime") return copy.typeDatetime
  if (type === "url") return copy.typeUrl
  return copy.typeText
}

function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template
  )
}

function draftsFromPlan(plan: EidosFileCsvImportPlan): CsvColumnDraft[] {
  return plan.columns.map((column) => ({
    sourceIndex: column.sourceIndex,
    name: column.name,
    type: column.type,
  }))
}

function CsvImportAction({
  adapter,
  copy,
  context,
}: {
  adapter: EidosFileCsvImportAdapter
  copy: EidosFileCsvImportCopy
  context: EidosFilePluginContext
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<EidosFileCsvImportSource | null>(null)
  const [plan, setPlan] = useState<EidosFileCsvImportPlan | null>(null)
  const [tableName, setTableName] = useState("")
  const [columns, setColumns] = useState<CsvColumnDraft[]>([])
  const [phase, setPhase] = useState<"idle" | "picking" | "preview" | "import">(
    "idle"
  )
  const [error, setError] = useState<string | null>(null)

  const options = useMemo<EidosFileCsvImportOptions>(
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
  const busy = phase !== "idle"
  const namesValid =
    Boolean(tableName.trim()) && columns.every((column) => column.name.trim())

  useEffect(
    () => () => {
      if (source) adapter.release?.(source)
    },
    [adapter, source]
  )

  const close = () => {
    if (busy) return
    setSource(null)
    setPlan(null)
    setError(null)
    setOpen(false)
  }

  const chooseFile = async () => {
    if (context.disabled || busy) return
    setPhase("picking")
    setError(null)
    try {
      const selected = await adapter.pickFile()
      if (!selected) return
      setSource(selected)
      setPlan(null)
      setOpen(true)
      setPhase("preview")
      const nextPlan = await adapter.preview(selected, {})
      setPlan(nextPlan)
      setTableName(nextPlan.tableName)
      setColumns(draftsFromPlan(nextPlan))
    } catch (pickError) {
      const message =
        pickError instanceof Error ? pickError.message : copy.unableToRead
      setError(message)
      context.onError?.(pickError)
      setOpen(true)
    } finally {
      setPhase("idle")
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!source || !plan || busy || !namesValid) return
    setPhase("import")
    setError(null)
    try {
      const imported = await adapter.import(source, options)
      context.onSnapshot(imported.snapshot)
      context.onTableSelect?.(imported.result.table.id)
      setSource(null)
      setPlan(null)
      setOpen(false)
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : copy.unableToImport
      setError(message)
      context.onError?.(importError)
    } finally {
      setPhase("idle")
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return
        if (nextOpen) setOpen(true)
        else close()
      }}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="eidos-file-workbar-action h-7 gap-1.5 px-2 text-xs"
          aria-label={copy.actionAriaLabel}
          title={copy.actionLabel}
          disabled={context.disabled || phase === "picking"}
          onClick={() => void chooseFile()}
        >
          {phase === "picking" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
          <span className="eidos-file-workbar-action-label">
            {copy.actionLabel}
          </span>
        </Button>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={5}
        className="w-[min(720px,calc(100vw-24px))] p-0"
      >
        <form onSubmit={(event) => void submit(event)}>
          <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                {copy.dialogTitle}
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {plan
                  ? interpolate(copy.fileSummary, {
                      file: plan.fileName,
                      count: plan.rowCount.toLocaleString(),
                    })
                  : (source?.fileName ?? copy.choosePrompt)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void chooseFile()}
            >
              {copy.chooseAnother}
            </Button>
          </div>

          {phase === "preview" && !plan ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              {copy.parsing}
            </div>
          ) : plan ? (
            <div className="max-h-[min(66vh,560px)] overflow-y-auto">
              <div className="grid gap-1.5 border-b px-4 py-3">
                <label
                  className="text-xs font-medium"
                  htmlFor="eidos-file-plugin-csv-table-name"
                >
                  {copy.tableName}
                </label>
                <Input
                  id="eidos-file-plugin-csv-table-name"
                  value={tableName}
                  disabled={busy}
                  onChange={(event) => setTableName(event.target.value)}
                />
              </div>
              <div className="border-b px-2 py-2">
                {columns.map((column, index) => (
                  <div
                    key={column.sourceIndex}
                    className="grid grid-cols-[minmax(140px,1fr)_140px] items-center gap-3 rounded px-2 py-1 hover:bg-muted/35"
                  >
                    <Input
                      value={column.name}
                      aria-label={interpolate(copy.fieldName, {
                        index: index + 1,
                      })}
                      disabled={busy}
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
                        {copy.titleType}
                      </span>
                    ) : (
                      <select
                        value={column.type}
                        aria-label={interpolate(copy.fieldType, {
                          name:
                            column.name ||
                            interpolate(copy.fieldName, { index: index + 1 }),
                        })}
                        className="h-7 rounded-md border bg-background px-2 text-xs outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        disabled={busy}
                        onChange={(event) =>
                          setColumns((current) =>
                            current.map((candidate) =>
                              candidate.sourceIndex === column.sourceIndex
                                ? {
                                    ...candidate,
                                    type: event.target
                                      .value as EidosFileCsvFieldType,
                                  }
                                : candidate
                            )
                          )
                        }
                      >
                        {FIELD_TYPES.map((fieldType) => (
                          <option key={fieldType} value={fieldType}>
                            {fieldTypeLabel(fieldType, copy)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 py-3">
                <h3 className="mb-2 text-xs font-medium">{copy.preview}</h3>
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
                              <span className="block truncate">
                                {row[column.sourceIndex] || "—"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {plan.issues.map((issue) => (
                  <p
                    key={issue.code}
                    className="mt-2 text-[11px] text-amber-700 dark:text-amber-400"
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-12 items-center justify-between gap-3 border-t px-4 py-2.5">
            <p
              className={cn(
                "flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground",
                error && "text-destructive"
              )}
              role={error ? "alert" : undefined}
            >
              {error ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              ) : null}
              {error ?? copy.localOnly}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={close}
              >
                {copy.cancel}
              </Button>
              <Button
                type="submit"
                size="xs"
                disabled={!plan || !namesValid || busy}
              >
                {phase === "import" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                ) : null}
                {phase === "import"
                  ? copy.importing
                  : interpolate(copy.importRows, {
                      count: plan?.rowCount.toLocaleString() ?? "",
                    })}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function createEidosFileCsvImportPlugin(
  adapter: EidosFileCsvImportAdapter,
  options: EidosFileCsvImportPluginOptions = {}
) {
  const id = options.id ?? "@eidos.space/eidos-file-ui/csv-import"
  const copy = {
    ...DEFAULT_COPY,
    ...options.copy,
    ...(options.label ? { actionLabel: options.label } : {}),
  }
  return defineEidosFilePlugin({
    id,
    actions: [
      {
        id: `${id}:workbar`,
        slot: "workbar" as const,
        order: options.order ?? 20,
        render: (context: EidosFilePluginContext) => (
          <CsvImportAction adapter={adapter} context={context} copy={copy} />
        ),
      },
    ],
  })
}
