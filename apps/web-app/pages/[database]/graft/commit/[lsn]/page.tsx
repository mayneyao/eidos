"use client"

import { useCallback, useEffect, useState } from "react"
import { useEidos } from "@eidos.space/react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  ChevronRight,
  Database,
  Info,
  LoaderIcon,
  Search,
  Table2,
} from "lucide-react"

import { DiffView } from "@/components/table/diff-view"
import { DiffDataGrid } from "@/components/table/diff-data-grid"
import { useTabTitle } from "@/hooks/use-tab-title"
import { getTableIdByRawTableName } from "@/lib/utils"
import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"

function resolveTableName(
  rawName: string,
  nodeMap: Record<string, any>
): string {
  if (!rawName.startsWith("tb_") && !rawName.startsWith("vw_")) return rawName
  const id = getTableIdByRawTableName(rawName)
  const node = nodeMap[id]
  return node?.name ?? rawName
}

function resolveSchemaNodeName(
  rawName: string,
  nodeMap: Record<string, any>
): string | undefined {
  if (!rawName.startsWith("tb_") && !rawName.startsWith("vw_")) return
  const id = getTableIdByRawTableName(rawName)
  return nodeMap[id]?.name
}

function getSchemaDisplayName(
  rawName: string,
  nodeMap: Record<string, any>
): string {
  const nodeName = resolveSchemaNodeName(rawName, nodeMap)
  return nodeName ? `${rawName} (${nodeName})` : rawName
}

const SCHEMA_PREFIX_GROUPS = [
  { prefix: "tb_", label: "tb_" },
  { prefix: "vw_", label: "vw_" },
  { prefix: "eidos_", label: "eidos_" },
  { prefix: "sqlite_", label: "sqlite_" },
  { prefix: "", label: "other" },
]

function getSchemaPrefixGroup(schema: any): string {
  const table = String(schema.table ?? "")
  return (
    SCHEMA_PREFIX_GROUPS.find(
      (group) => group.prefix && table.startsWith(group.prefix)
    )?.prefix ?? ""
  )
}

function isDisplaySchema(schema: any): boolean {
  const table = String(schema?.table ?? "")
  const type = String(schema?.type ?? "")
  return Boolean(table) && type !== "database" && table !== "db.sqlite3"
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

function getDiffErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)
  if (
    message.includes("VolumeNotFound") ||
    message.toLowerCase().includes("not found")
  ) {
    return "Row-level diff is unavailable because this commit range is not present in the current repository history."
  }
  return "Row-level diff is unavailable for this commit range."
}

function resolveCommitDiffBase(
  show: any,
  requestedFrom: string | null
): string | null {
  const parents = Array.isArray(show?.parents)
    ? show.parents.map(String).filter(Boolean)
    : []
  const primaryParent =
    show?.parent != null
      ? String(show.parent)
      : parents.length > 0
        ? parents[0]
        : null

  if (requestedFrom && parents.includes(requestedFrom)) return requestedFrom
  return primaryParent ?? requestedFrom
}

export default function GraftCommitDetail() {
  const { params, searchParams } = useRouterAdapter()
  const eidos = useEidos()
  const lsn = params.lsn
  const fromLsn = searchParams?.get("from") ?? null

  const [show, setShow] = useState<any>(null)
  const [diff, setDiff] = useState<any>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const nodeMap = useNodeMap()

  useTabTitle(`Commit ${lsn?.slice(0, 12) ?? ""}`)

  useEffect(() => {
    if (!lsn) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDiff(null)
    setDiffError(null)

    eidos.currentSpace.graft
      .show(lsn)
      .then(async (showRes) => {
        if (cancelled) return
        setShow(showRes)

        const diffBase = resolveCommitDiffBase(showRes, fromLsn)
        if (!diffBase) {
          setDiff(null)
          return
        }

        const diffRes = await eidos.currentSpace.graft
          .diff(diffBase, lsn, "rows")
          .catch((e: unknown) => {
            if (!cancelled) setDiffError(getDiffErrorMessage(e))
            return null
          })

        if (cancelled) return
        setDiff(diffRes)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(getErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lsn, fromLsn, eidos.currentSpace])

  if (loading)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderIcon className="h-3 w-3 animate-spin" />
        Loading...
      </div>
    )

  if (error)
    return (
      <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-destructive">
        {error}
      </div>
    )

  const titleId = show?.shortId ?? lsn?.slice(0, 12) ?? lsn
  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-6">
      <h1 className="mb-4 text-base font-semibold tracking-tight">
        Commit <span className="tabular-nums">{titleId}</span>
      </h1>
      <CommitSummary show={show} nodeMap={nodeMap} />
      <div className="flex-1 overflow-hidden">
        <ChangesView diff={diff} diffError={diffError} nodeMap={nodeMap} />
      </div>
    </div>
  )
}

/* Changes */

function CommitSummary({
  show,
  nodeMap,
}: {
  show: any
  nodeMap: Record<string, any>
}) {
  const [showSchemas, setShowSchemas] = useState(false)
  if (!show) return null
  const displaySchemas = [...(show.schemas ?? [])].filter(isDisplaySchema)
  const schemaCount = displaySchemas.length
  const tableCount = Number(show.changedTables ?? show.tables?.length ?? 0)
  const rowChanges = Number(
    show.rowChanges ??
      (show.tables ?? []).reduce(
        (total: number, table: any) =>
          total +
          Number(table.inserts ?? 0) +
          Number(table.deletes ?? 0) +
          Number(table.updates ?? 0),
        0
      )
  )
  const hasTableStats = tableCount > 0 || rowChanges > 0
  const schemaGroups = SCHEMA_PREFIX_GROUPS.map((group) => ({
    ...group,
    schemas: displaySchemas
      .filter((schema: any) => getSchemaPrefixGroup(schema) === group.prefix)
      .sort((a: any, b: any) =>
        getSchemaDisplayName(a.table, nodeMap).localeCompare(
          getSchemaDisplayName(b.table, nodeMap),
          undefined,
          { numeric: true, sensitivity: "base" }
        )
      ),
  })).filter((group) => group.schemas.length > 0)

  return (
    <div className="mb-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {show.pageCount != null ? (
            <span>
              <span className="font-medium text-foreground">
                {show.pageCount}
              </span>{" "}
              pages
            </span>
          ) : null}
          {show.changedPages != null ? (
            !hasTableStats ? (
              <span>
                <span className="font-medium text-foreground">
                  {formatCount(show.changedPages)}
                </span>{" "}
                changed pages
              </span>
            ) : null
          ) : null}
          {tableCount > 0 ? (
            <span>
              <span className="font-medium text-foreground">
                {formatCount(tableCount)}
              </span>{" "}
              table{tableCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {rowChanges > 0 ? (
            <span>
              <span className="font-medium text-foreground">
                {formatCount(rowChanges)}
              </span>{" "}
              row change{rowChanges === 1 ? "" : "s"}
            </span>
          ) : null}
          {show.checkpoint ? <span>checkpoint</span> : null}
          {show.segment ? (
            <span className="font-mono">
              segment {show.segment.slice(0, 8)}
            </span>
          ) : null}
        </div>
        {schemaCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowSchemas((v) => !v)}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${showSchemas ? "rotate-90" : ""}`}
            />
            {schemaCount} schema change{schemaCount === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
      {showSchemas && schemaGroups.length > 0 ? (
        <div className="mt-2 space-y-2">
          {schemaGroups.map((group) => (
            <div key={group.prefix || "other"} className="flex gap-2">
              <div className="w-16 shrink-0 pt-0.5 text-[10px] font-medium text-muted-foreground">
                {group.label}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {group.schemas.map((schema: any) => {
                  const nodeName = resolveSchemaNodeName(schema.table, nodeMap)
                  return (
                    <span
                      key={`${schema.table}-${schema.rootPage ?? ""}`}
                      className="inline-flex max-w-full items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px]"
                      title={getSchemaDisplayName(schema.table, nodeMap)}
                    >
                      <span className="min-w-0 truncate font-mono text-foreground">
                        {schema.table}
                      </span>
                      {nodeName ? (
                        <span className="shrink-0 text-muted-foreground">
                          ({nodeName})
                        </span>
                      ) : null}
                      {schema.rowCount != null ? (
                        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                          {schema.rowCount}
                        </span>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChangesView({
  diff,
  diffError,
  nodeMap,
  initialTable,
  emptyMessage = "This commit has no previous local commit to diff against.",
  fileFallbackMessage = "SQLite row-level details were not returned for this commit range.",
}: {
  diff: any
  diffError: string | null
  nodeMap: Record<string, any>
  initialTable?: string
  emptyMessage?: string
  fileFallbackMessage?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  useEffect(() => {
    if (!initialTable) return
    setExpanded((prev) => {
      if (prev.has(initialTable)) return prev
      const next = new Set(prev)
      next.add(initialTable)
      return next
    })
  }, [initialTable])

  useEffect(() => {
    if (!initialTable || !diff?.rows?.length) return
    const timeout = window.setTimeout(() => {
      document
        .getElementById(getTableSectionId(initialTable))
        ?.scrollIntoView({ block: "start" })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [diff?.rows, initialTable])

  const diagnosticGroups = diff ? getDiffDiagnosticGroups(diff) : []

  if (diffError) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Diff unavailable</div>
        <div className="mt-1">{diffError}</div>
      </div>
    )
  }

  if (!diff || diff.empty) {
    return (
      <div className="space-y-3 pt-4">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        <SQLiteDiagnostics groups={diagnosticGroups} />
      </div>
    )
  }
  if (!diff.rows?.length) {
    return (
      <div
        className="h-full w-full overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="space-y-3 pb-4">
          {diff.files?.length ? (
            <FileChanges files={diff.files} message={fileFallbackMessage} />
          ) : (
            <p className="pt-4 text-sm text-muted-foreground">
              No row-level changes.
            </p>
          )}
          <SQLiteDiagnostics groups={diagnosticGroups} defaultOpen />
        </div>
      </div>
    )
  }

  const byTable: Record<string, any[]> = {}
  for (const r of diff.rows) {
    if (!byTable[r.table]) byTable[r.table] = []
    byTable[r.table].push(r)
  }
  const names = Object.keys(byTable).sort()

  return (
    <div
      className="h-full overflow-y-auto w-full"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="space-y-2 pb-4">
        {names.map((name) => (
          <TableSection
            key={name}
            name={name}
            rows={byTable[name]}
            nodeMap={nodeMap}
            open={expanded.has(name)}
            onToggle={toggle}
            highlighted={initialTable === name}
          />
        ))}
        <SQLiteDiagnostics groups={diagnosticGroups} />
      </div>
    </div>
  )
}

type DiffDiagnosticGroup = {
  key: string
  kind: string
  label: string
  count: number
  items: DiffDiagnosticItem[]
}

type DiffDiagnosticItem = {
  subject: string
  detail: string
}

function SQLiteDiagnostics({
  groups,
  defaultOpen = false,
}: {
  groups: DiffDiagnosticGroup[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!groups.length) return null

  const count = groups.reduce((total, group) => total + group.count, 0)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded py-1 text-left text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 flex-1 font-medium">SQLite diagnostics</span>
        <span className="shrink-0 text-[10px]">usually no action</span>
        <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] tabular-nums">
          {count}
        </span>
      </button>

      {open ? (
        <div className="ml-2 mt-1 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
          <div className="mb-2 flex items-start gap-2 text-[11px] leading-4 text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Debug metadata from SQLite tables, indexes, parser limitations,
              and file-level snapshot changes. Expand a category to inspect
              every object.
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {groups.map((group) => (
              <DiffDiagnosticGroupRow key={group.key} group={group} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DiffDiagnosticGroupRow({ group }: { group: DiffDiagnosticGroup }) {
  const [open, setOpen] = useState(false)
  const preview = group.items
    .slice(0, 3)
    .map((item) => item.subject)
    .join(", ")

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 py-1.5 text-left text-xs hover:text-foreground"
      >
        <ChevronRight
          className={`mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="mt-0.5 shrink-0 text-muted-foreground/70">
          {diffDiagnosticIcon(group.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-medium text-foreground">
              {group.label}
            </span>
            {preview ? (
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                {preview}
                {group.items.length > 3 ? ", ..." : ""}
              </span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {group.count}
        </span>
      </button>

      {open ? (
        <div className="mb-2 ml-8 max-h-60 overflow-y-auto rounded-sm border border-border/60 bg-background/70">
          {group.items.map((item, index) => (
            <div
              key={`${item.subject}-${item.detail}-${index}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border/50 px-2 py-1.5 text-[11px] last:border-b-0"
            >
              <span className="min-w-0 break-all font-mono text-foreground">
                {item.subject}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {item.detail}
              </span>
            </div>
          ))}
          {group.count > group.items.length ? (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              {group.count - group.items.length} duplicate diagnostic
              {group.count - group.items.length === 1 ? "" : "s"} omitted.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function addDiffDiagnosticItem(
  groups: Map<string, DiffDiagnosticGroup>,
  kind: string,
  label: string,
  subject: string | undefined,
  detail: string
) {
  const key = `${kind}:${label}`
  const group =
    groups.get(key) ??
    ({
      key,
      kind,
      label,
      count: 0,
      items: [],
    } satisfies DiffDiagnosticGroup)
  group.count += 1

  if (subject) {
    const itemKey = `${subject}:${detail}`
    if (
      !group.items.some((item) => `${item.subject}:${item.detail}` === itemKey)
    ) {
      group.items.push({ subject, detail })
    }
  }
  groups.set(key, group)
}

function getDiffDiagnosticGroups(diff: any): DiffDiagnosticGroup[] {
  const groups = new Map<string, DiffDiagnosticGroup>()

  for (const change of getOpaqueChanges(diff)) {
    addDiffDiagnosticItem(
      groups,
      change.reason,
      formatOpaqueDiagnosticLabel(change),
      change.owner || change.table,
      change.change
    )
  }
  for (const file of getLogicalNoopFiles(diff)) {
    addDiffDiagnosticItem(
      groups,
      "logical_noop_file",
      "File changed, rows did not",
      file.path,
      file.change
    )
  }
  for (const limitation of getDiffLimitations(diff)) {
    addDiffDiagnosticItem(
      groups,
      limitation.kind,
      formatDiffLimitationKind(limitation.kind),
      limitation.subject,
      "parser limitation"
    )
  }

  return Array.from(groups.values()).sort((a, b) => {
    const priorityA = diffDiagnosticPriority(a.kind)
    const priorityB = diffDiagnosticPriority(b.kind)
    if (priorityA !== priorityB) return priorityA - priorityB
    return b.count - a.count || a.label.localeCompare(b.label)
  })
}

function diffDiagnosticPriority(kind: string) {
  switch (kind) {
    case "without_rowid_table":
      return 0
    case "generated_columns":
    case "utf16_text_encoding":
      return 1
    case "sqlite_internal_table":
      return 2
    case "virtual_table":
      return 3
    case "fts_shadow_table":
      return 4
    case "logical_noop_file":
      return 5
    default:
      return 6
  }
}

function diffDiagnosticIcon(kind: string) {
  if (kind === "fts_shadow_table") {
    return <Search className="h-3.5 w-3.5" />
  }
  if (
    kind === "virtual_table" ||
    kind === "without_rowid_table" ||
    kind === "generated_columns"
  ) {
    return <Table2 className="h-3.5 w-3.5" />
  }
  return <Database className="h-3.5 w-3.5" />
}

function FileChanges({ files, message }: { files: any[]; message: string }) {
  return (
    <div className="pt-4">
      <div className="rounded-md border border-border/60">
        <div className="border-b border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          File changes
        </div>
        <div className="divide-y divide-border/60">
          {files.map((file) => (
            <div key={`${file.path}-${file.change}`} className="px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-mono">{file.path}</span>
                <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {file.change}
                </span>
              </div>
              {file.message ? (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {file.message}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

type OpaqueChange = {
  table: string
  change: string
  reason: string
  owner?: string
}

type DiffLimitation = {
  kind: string
  subject?: string
}

type LogicalNoopFile = {
  path: string
  change: string
}

function getOpaqueChanges(diff: any): OpaqueChange[] {
  const changes = Array.isArray(diff?.opaqueChanges)
    ? diff.opaqueChanges
    : Array.isArray(diff?.opaque_changes)
      ? diff.opaque_changes
      : []
  const normalized = changes
    .map((change: any) => ({
      table: String(change?.table ?? change?.name ?? ""),
      change: String(change?.change ?? "modified"),
      reason: String(change?.reason ?? "opaque"),
      owner:
        change?.owner === undefined || change?.owner === null
          ? undefined
          : String(change.owner),
    }))
    .filter((change: any) => change.table || change.owner)
  return Array.from(
    new Map<string, OpaqueChange>(
      normalized.map((change: OpaqueChange) => [
        `${change.owner || change.table}:${change.reason}:${change.change}`,
        change,
      ])
    ).values()
  )
}

function getLogicalNoopFiles(diff: any): LogicalNoopFile[] {
  const files = Array.isArray(diff?.files) ? diff.files : []
  return files.filter((file: any) => {
    const status = file?.logicalStatus ?? file?.logical_status
    return status === "file_changed_no_supported_logical_changes"
  }) as LogicalNoopFile[]
}

function getDiffLimitations(diff: any): DiffLimitation[] {
  const fromTopLevel = normalizeDiffLimitations(diff?.limitations)
  const fromFiles = Array.isArray(diff?.files)
    ? diff.files.flatMap((file: any) =>
        normalizeDiffLimitations(file?.limitations)
      )
    : []
  const byKey = new Map<string, DiffLimitation>()
  for (const limitation of [...fromTopLevel, ...fromFiles]) {
    byKey.set(`${limitation.kind}:${limitation.subject ?? ""}`, limitation)
  }
  return Array.from(byKey.values())
}

function normalizeDiffLimitations(value: any): DiffLimitation[] {
  if (!Array.isArray(value)) return []
  return value
    .map((limitation: any) => {
      if (typeof limitation === "string") return { kind: limitation }
      const kind = String(limitation?.kind ?? limitation?.reason ?? "")
      if (!kind) return null
      return {
        kind,
        subject:
          limitation?.subject === undefined || limitation?.subject === null
            ? undefined
            : String(limitation.subject),
      }
    })
    .filter(Boolean) as DiffLimitation[]
}

function formatOpaqueDiagnosticLabel(change: OpaqueChange) {
  switch (change.reason) {
    case "fts_shadow_table":
      return "Search index"
    case "virtual_table":
      return "Virtual table"
    case "without_rowid_table":
      return "Unsupported table"
    case "sqlite_internal_table":
      return "SQLite internal"
    default:
      return change.reason.replace(/_/g, " ")
  }
}

function formatDiffLimitationKind(kind: string) {
  switch (kind) {
    case "without_rowid_table":
      return "Unsupported table"
    case "sqlite_internal_table":
      return "SQLite internal"
    case "generated_columns":
      return "Generated columns"
    case "utf16_text_encoding":
      return "UTF-16 text"
    case "fts_shadow_table":
      return "Search index"
    case "virtual_table":
      return "Virtual table"
    default:
      return kind.replace(/_/g, " ")
  }
}

function getTableSectionId(name: string): string {
  return `graft-diff-table-${encodeURIComponent(name)}`
}

const CONTEXT_CHANGE_COLUMNS = ["title", "name", "_id", "id"]
const SYSTEM_CHANGE_COLUMNS = new Set([
  "_created_time",
  "_created_by",
  "_last_edited_time",
  "_last_edited_by",
])

function TableSection({
  name,
  rows,
  nodeMap,
  open,
  onToggle,
  highlighted = false,
}: {
  name: string
  rows: any[]
  nodeMap: Record<string, any>
  open: boolean
  onToggle: (name: string) => void
  highlighted?: boolean
}) {
  const inserts = rows.filter((r: any) => r.op === "insert").length
  const deletes = rows.filter((r: any) => r.op === "delete").length
  const updates = rows.filter((r: any) => r.op === "update").length
  const total = rows.length
  const singleUpdateRow =
    rows.length === 1 && rows[0]?.op === "update" ? rows[0] : null
  const singleMarkdownIndex =
    singleUpdateRow && name === "eidos__docs"
      ? (singleUpdateRow.columns?.indexOf("markdown") ?? -1)
      : -1
  const markdownUpdateRows =
    !singleUpdateRow && name === "eidos__docs"
      ? rows.filter((row: any) => {
          const markdownIndex = row.columns?.indexOf("markdown") ?? -1
          return row.op === "update" && markdownIndex >= 0
        })
      : []
  const markdownUpdateSet = new Set(markdownUpdateRows)
  const gridRows = rows.filter((row) => !markdownUpdateSet.has(row))
  const columns = getChangeColumns(gridRows)
  const changedFields = getChangedFields(gridRows)
  const gridUpdates = gridRows.filter((r: any) => r.op === "update").length

  return (
    <div
      id={getTableSectionId(name)}
      className={
        highlighted ? "rounded-md bg-primary/5 ring-1 ring-primary/20" : ""
      }
    >
      <button
        onClick={() => onToggle(name)}
        className="flex w-full items-center gap-2 rounded py-1 text-left text-xs hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="font-medium">{resolveTableName(name, nodeMap)}</span>
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          {inserts > 0 && <span className="text-emerald-600">+{inserts}</span>}
          {deletes > 0 && <span className="text-rose-600">-{deletes}</span>}
          {updates > 0 && <span className="text-amber-600">~{updates}</span>}
          <span className="text-muted-foreground">{total}</span>
        </div>
      </button>

      {open && rows.length > 0 && (
        <div className="ml-2 mt-1 space-y-2">
          {singleUpdateRow ? (
            singleMarkdownIndex >= 0 ? (
              <DiffView
                oldContent={String(
                  singleUpdateRow.before?.[singleMarkdownIndex] ?? ""
                )}
                newContent={String(
                  singleUpdateRow.values?.[singleMarkdownIndex] ??
                    singleUpdateRow.after?.[singleMarkdownIndex] ??
                    ""
                )}
                filename={`row ${singleUpdateRow.rowid ?? "update"} - markdown`}
              />
            ) : (
              <DiffView
                oldContent={formatChangeAsJson(singleUpdateRow, "before")}
                newContent={formatChangeAsJson(singleUpdateRow, "after")}
                filename={`${name}-row-${singleUpdateRow.rowid ?? "update"}.json`}
              />
            )
          ) : gridRows.length > 0 ? (
            <>
              {gridUpdates > 0 && changedFields.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-1 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {formatCount(gridUpdates)} update
                    {gridUpdates === 1 ? "" : "s"}
                  </span>
                  <span>changed</span>
                  {changedFields.slice(0, 6).map((column) => (
                    <span
                      key={column}
                      className="max-w-56 truncate rounded border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 font-mono text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-100"
                      title={column}
                    >
                      {column}
                    </span>
                  ))}
                  {changedFields.length > 6 ? (
                    <span>+{changedFields.length - 6} more</span>
                  ) : null}
                </div>
              ) : null}
              <DiffDataGrid rows={gridRows} columns={columns} />
            </>
          ) : null}
          {markdownUpdateRows.map((change: any, idx: number) => {
            const markdownIndex = change.columns?.indexOf("markdown") ?? -1
            return (
              <DiffView
                key={`${change.rowid ?? idx}-markdown`}
                oldContent={String(change.before?.[markdownIndex] ?? "")}
                newContent={String(
                  change.values?.[markdownIndex] ??
                    change.after?.[markdownIndex] ??
                    ""
                )}
                filename={`row ${change.rowid ?? idx} - markdown`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function arrayValueAt(values: unknown[] | undefined, index: number) {
  if (!Array.isArray(values) || index < 0 || index >= values.length) {
    return { present: false, value: undefined }
  }
  return { present: true, value: values[index] }
}

function sameChangeValue(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return Object.is(a, b)
  }
}

function getRowColumnValue(row: any, column: string) {
  const index = row.columns?.indexOf(column) ?? -1
  if (index < 0) return { before: undefined, after: undefined }

  const valuesAfter = arrayValueAt(row.values, index)
  const afterValue = arrayValueAt(row.after, index)
  const beforeValue = arrayValueAt(row.before, index)
  const deleteValue = arrayValueAt(row.values, index)

  return {
    before: beforeValue.present
      ? beforeValue.value
      : row.op === "delete" && deleteValue.present
        ? deleteValue.value
        : undefined,
    after: valuesAfter.present ? valuesAfter.value : afterValue.value,
  }
}

function isRowColumnChanged(row: any, column: string): boolean {
  if (row.op !== "update") return true
  const { before, after } = getRowColumnValue(row, column)
  return !sameChangeValue(before, after)
}

function getAllChangeColumns(rows: any[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const col of row.columns ?? []) {
      if (typeof col === "string" && !seen.has(col)) seen.add(col)
    }
  }
  return [...seen]
}

function getRawChangedColumns(rows: any[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const col of row.columns ?? []) {
      if (
        typeof col === "string" &&
        !seen.has(col) &&
        isRowColumnChanged(row, col)
      ) {
        seen.add(col)
      }
    }
  }
  return [...seen]
}

function pickContextColumns(
  allColumns: string[],
  changedColumns: Set<string>
): string[] {
  const labelColumn = CONTEXT_CHANGE_COLUMNS.slice(0, 2).find(
    (column) => allColumns.includes(column) && !changedColumns.has(column)
  )
  if (labelColumn) return [labelColumn]

  const idColumn = CONTEXT_CHANGE_COLUMNS.slice(2).find(
    (column) => allColumns.includes(column) && !changedColumns.has(column)
  )
  return idColumn ? [idColumn] : []
}

function orderedChangedColumns(rows: any[]): string[] {
  const changed = getRawChangedColumns(rows)
  const userColumns = changed.filter(
    (column) => !SYSTEM_CHANGE_COLUMNS.has(column)
  )
  const systemColumns = changed.filter((column) =>
    SYSTEM_CHANGE_COLUMNS.has(column)
  )
  return [...userColumns, ...systemColumns]
}

function getChangeColumns(rows: any[]): string[] {
  const allColumns = getAllChangeColumns(rows)
  const changedColumns = orderedChangedColumns(rows)
  if (!changedColumns.length) return allColumns

  const changedSet = new Set(changedColumns)
  const contextColumns = pickContextColumns(allColumns, changedSet)
  const result = new Set([...contextColumns, ...changedColumns])

  if (rows.some((row) => row.op !== "update")) {
    for (const column of allColumns) {
      if (!result.has(column) && !SYSTEM_CHANGE_COLUMNS.has(column)) {
        result.add(column)
      }
    }
    for (const column of allColumns) {
      if (!result.has(column)) result.add(column)
    }
  }

  return [...result]
}

function getChangedFields(rows: any[]): string[] {
  return orderedChangedColumns(rows)
}

function formatChangeAsJson(change: any, side: "before" | "after"): string {
  const columns = Array.isArray(change.columns) ? change.columns : []
  const values =
    side === "before"
      ? (change.before ?? change.old_values ?? [])
      : (change.after ?? change.values ?? [])
  const row: Record<string, unknown> = {}

  if (change.rowid != null) {
    row.rowid = change.rowid
  }

  const length = Math.max(
    columns.length,
    Array.isArray(values) ? values.length : 0
  )
  for (let i = 0; i < length; i++) {
    const key = typeof columns[i] === "string" ? columns[i] : `column_${i + 1}`
    row[key] = Array.isArray(values) ? values[i] : undefined
  }

  return JSON.stringify(row, null, 2)
}
