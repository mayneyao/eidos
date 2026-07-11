import { useState } from "react"
import { ChevronRight, Database, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import type {
  SpaceVersionSqliteFileDiff,
  SpaceVersionSqliteRowChange,
  SpaceVersionSqliteTableDiff,
  SpaceVersionSqliteValue,
} from "@/apps/web-app/hooks/use-space-versioning"

const MAX_RENDERED_ROWS = 200
const HIDDEN_RECORD_COLUMNS = new Set([
  "_created_by",
  "_created_time",
  "_last_edited_by",
  "_last_edited_time",
])

interface ChangeCounts {
  insert: number
  update: number
  delete: number
}

function changeCounts(changes: SpaceVersionSqliteRowChange[]): ChangeCounts {
  return changes.reduce<ChangeCounts>(
    (counts, change) => {
      counts[change.operation] += 1
      return counts
    },
    { insert: 0, update: 0, delete: 0 }
  )
}

function mergeCounts(tables: SpaceVersionSqliteTableDiff[]): ChangeCounts {
  return tables.reduce<ChangeCounts>(
    (total, table) => {
      const tableCounts = changeCounts(table.changes)
      total.insert += tableCounts.insert
      total.update += tableCounts.update
      total.delete += tableCounts.delete
      return total
    },
    { insert: 0, update: 0, delete: 0 }
  )
}

function visibleTables(
  tables: SpaceVersionSqliteTableDiff[]
): SpaceVersionSqliteTableDiff[] {
  return tables.flatMap((table) => {
    if (table.name !== "eidos__meta") return [table]
    const keyIndex = table.columns.indexOf("key")
    if (keyIndex < 0) return [table]
    const changes = table.changes.filter((change) => {
      const nextKey = change.values[keyIndex]
      const previousKey = change.beforeValues?.[keyIndex]
      return nextKey !== "updated_at" && previousKey !== "updated_at"
    })
    return changes.length > 0 ? [{ ...table, changes }] : []
  })
}

function formatValue(value: SpaceVersionSqliteValue | undefined): string {
  if (value === undefined) return "—"
  if (value === null) return "NULL"
  if (value === "") return '""'
  return String(value)
}

function tableLabel(name: string): { label: string; context: string | null } {
  if (name.startsWith("tb_") && name.length > 3) {
    return { label: name.slice(3), context: "Records" }
  }
  const systemNames: Record<string, string> = {
    eidos__columns: "Fields",
    eidos__meta: "Base metadata",
    eidos__references: "Relations",
    eidos__tables: "Tables",
    eidos__views: "Views",
  }
  return systemNames[name]
    ? { label: systemNames[name], context: "Structure" }
    : { label: name, context: null }
}

function ChangeSummary({ counts }: { counts: ChangeCounts }) {
  return (
    <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">
        +{counts.insert}
      </span>
      <span className="text-amber-600 dark:text-amber-400">
        ~{counts.update}
      </span>
      <span className="text-rose-600 dark:text-rose-400">−{counts.delete}</span>
    </span>
  )
}

function OperationCell({
  operation,
}: Pick<SpaceVersionSqliteRowChange, "operation">) {
  const meta = {
    insert: {
      label: "Added",
      className: "text-emerald-700 dark:text-emerald-400",
    },
    update: {
      label: "Changed",
      className: "text-amber-700 dark:text-amber-400",
    },
    delete: {
      label: "Deleted",
      className: "text-rose-700 dark:text-rose-400",
    },
  }[operation]
  return <span className={cn("font-medium", meta.className)}>{meta.label}</span>
}

function ValueCell({
  change,
  columnIndex,
}: {
  change: SpaceVersionSqliteRowChange
  columnIndex: number
}) {
  const next = change.values[columnIndex]
  const previous = change.beforeValues?.[columnIndex]
  const nextLabel = formatValue(next)
  const previousLabel = formatValue(previous)

  if (change.operation === "update" && !Object.is(previous, next)) {
    return (
      <div className="grid min-w-24 gap-0.5 leading-4">
        <span
          className="truncate text-rose-700/80 line-through decoration-rose-500/50 dark:text-rose-300/70"
          title={previousLabel}
        >
          {previousLabel}
        </span>
        <span
          className="truncate text-emerald-700 dark:text-emerald-300"
          title={nextLabel}
        >
          {nextLabel}
        </span>
      </div>
    )
  }

  const label = nextLabel
  return (
    <span
      className={cn(
        "block min-w-24 truncate",
        next === null && "italic text-muted-foreground",
        change.operation === "delete" &&
          "text-rose-700/80 line-through decoration-rose-500/50 dark:text-rose-300/70",
        change.operation === "insert" &&
          "text-emerald-700 dark:text-emerald-300"
      )}
      title={label}
    >
      {label}
    </span>
  )
}

function TableDiff({
  table,
  defaultOpen,
}: {
  table: SpaceVersionSqliteTableDiff
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const counts = changeCounts(table.changes)
  const presentation = tableLabel(table.name)
  const visibleChanges = table.changes.slice(0, MAX_RENDERED_ROWS)
  const visibleColumns = table.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !HIDDEN_RECORD_COLUMNS.has(column))

  return (
    <section className="border-b last:border-b-0">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 px-3 text-left outline-hidden hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90"
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {presentation.label}
          {presentation.context ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {presentation.context}
            </span>
          ) : null}
        </span>
        <ChangeSummary counts={counts} />
      </button>

      {open ? (
        table.changes.length === 0 ? (
          <p className="border-t px-9 py-3 text-xs text-muted-foreground">
            No ordinary row changes were returned for this table.
          </p>
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-max border-collapse text-left text-[11px]">
              <thead className="bg-muted/25 text-[10px] font-medium text-muted-foreground">
                <tr>
                  <th className="h-7 border-r px-3 font-medium">Change</th>
                  {visibleColumns.map(({ column }) => (
                    <th
                      key={column}
                      className="h-7 min-w-32 max-w-64 border-r px-3 font-medium last:border-r-0"
                    >
                      {column}
                    </th>
                  ))}
                  {visibleColumns.length === 0 ? (
                    <th className="h-7 px-3 font-medium">Row ID</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visibleChanges.map((change, index) => (
                  <tr
                    key={`${change.operation}:${change.rowId}:${index}`}
                    className="border-t align-top first:border-t-0 hover:bg-muted/20"
                  >
                    <td className="h-9 border-r px-3 py-2">
                      <OperationCell operation={change.operation} />
                    </td>
                    {visibleColumns.map(({ column, index: columnIndex }) => (
                      <td
                        key={column}
                        className="h-9 max-w-64 border-r px-3 py-2 last:border-r-0"
                      >
                        <ValueCell change={change} columnIndex={columnIndex} />
                      </td>
                    ))}
                    {visibleColumns.length === 0 ? (
                      <td className="h-9 px-3 py-2 font-mono text-muted-foreground">
                        {change.rowId}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.changes.length > visibleChanges.length ? (
              <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
                Showing the first {visibleChanges.length.toLocaleString()} of{" "}
                {table.changes.length.toLocaleString()} row changes.
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  )
}

export function BaseDiffView({
  file,
  className,
}: {
  file: SpaceVersionSqliteFileDiff
  className?: string
}) {
  const tables = visibleTables(file.tables)
  const counts = mergeCounts(tables)
  const hasStructuralDetails =
    file.limitations.length > 0 || file.opaqueChanges.length > 0

  return (
    <div className={cn("min-h-0 overflow-auto text-foreground", className)}>
      <div className="flex h-9 items-center gap-2 border-b px-3">
        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {tables.length.toLocaleString()} changed{" "}
          {tables.length === 1 ? "table" : "tables"}
        </span>
        <ChangeSummary counts={counts} />
      </div>

      {!file.rowDiffAvailable ? (
        <div className="px-3 py-4 text-xs leading-5 text-muted-foreground">
          {file.message ??
            "Graft tracks this Base file, but row-level details are unavailable for this comparison."}
        </div>
      ) : tables.length === 0 ? (
        <div className="px-3 py-4 text-xs leading-5 text-muted-foreground">
          No ordinary row changes were found. The file may only contain SQLite
          structure or storage changes.
        </div>
      ) : (
        tables.map((table, index) => (
          <TableDiff key={table.name} table={table} defaultOpen={index < 3} />
        ))
      )}

      {hasStructuralDetails ? (
        <div className="flex items-start gap-2 border-t px-3 py-2 text-[10px] leading-4 text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            SQLite indexes and unsupported structures remain tracked at the
            whole-file level.
          </span>
        </div>
      ) : null}
    </div>
  )
}
