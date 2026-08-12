import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, LoaderCircle } from "lucide-react"

import type { EidosSyncMergeConflict } from "../shared/contracts"
import { mergeConflictTableName } from "./merge-change-tree"

type FieldMode = "changed" | "all"
type MergeRowVersion = "base" | "local" | "hosted"

interface MergeTableGroup {
  name: string
  conflicts: EidosSyncMergeConflict[]
  schemaConflicts: EidosSyncMergeConflict[]
  columns: string[]
}

interface MergeFieldVersions {
  base: string
  local: string
  hosted: string
}

function displayValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "—"
  if (typeof value === "string") return value || '\"\"'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === undefined || right === undefined) return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return String(left) === String(right)
  }
}

function rowFor(
  conflict: EidosSyncMergeConflict,
  version: MergeRowVersion
): unknown[] | undefined {
  if (version === "base") return conflict.baseRow
  return version === "local" ? conflict.oursRow : conflict.theirsRow
}

function conflictColumns(conflict: EidosSyncMergeConflict): string[] {
  const rowLength = Math.max(
    conflict.baseRow?.length ?? 0,
    conflict.oursRow?.length ?? 0,
    conflict.theirsRow?.length ?? 0
  )
  return Array.from({ length: rowLength }, (_, index) =>
    conflict.rowColumns?.[index]
      ? conflict.rowColumns[index]!
      : conflict.columns?.[index]
        ? conflict.columns[index]!
        : `Column ${index + 1}`
  )
}

function groupConflicts(
  conflicts: EidosSyncMergeConflict[],
  schemaConflicts: EidosSyncMergeConflict[]
): MergeTableGroup[] {
  const groups = new Map<string, EidosSyncMergeConflict[]>()
  conflicts.forEach((conflict) => {
    const name = conflict.table ?? "Unknown table"
    groups.set(name, [...(groups.get(name) ?? []), conflict])
  })
  schemaConflicts.forEach((conflict) => {
    const name = mergeConflictTableName(conflict)
    if (name && !groups.has(name)) groups.set(name, [])
  })
  return [...groups.entries()].map(([name, tableConflicts]) => {
    const tableSchemaConflicts = schemaConflicts.filter(
      (conflict) => mergeConflictTableName(conflict) === name
    )
    return {
      name,
      conflicts: tableConflicts,
      schemaConflicts: tableSchemaConflicts,
      columns: [
        ...new Set(
          tableConflicts.flatMap((conflict) => conflictColumns(conflict))
        ),
      ],
    }
  })
}

function normalizedSide(side: string): "local" | "hosted" | null {
  const normalized = side.toLowerCase()
  if (normalized === "ours" || normalized === "local") return "local"
  if (normalized === "theirs" || normalized === "hosted") return "hosted"
  return null
}

function versionName(
  operation: string,
  from: string | undefined,
  to: string | undefined,
  fallback: string
): string {
  const normalized = operation.toLowerCase()
  if (normalized.includes("delete") || normalized.includes("drop")) {
    return "Removed"
  }
  return to ?? from ?? fallback
}

function schemaFieldVersions(
  conflict: EidosSyncMergeConflict
): MergeFieldVersions[] {
  const groups = new Map<
    string,
    Partial<
      Record<
        "local" | "hosted",
        { operation: string; from?: string; to?: string }
      >
    >
  >()
  for (const change of conflict.columnChanges ?? []) {
    const side = normalizedSide(change.side)
    if (!side) continue
    const identity = change.from ?? change.to
    if (!identity) continue
    const current = groups.get(identity) ?? {}
    current[side] = change
    groups.set(identity, current)
  }
  return [...groups.entries()].map(([base, changes]) => ({
    base,
    local: changes.local
      ? versionName(
          changes.local.operation,
          changes.local.from,
          changes.local.to,
          base
        )
      : base,
    hosted: changes.hosted
      ? versionName(
          changes.hosted.operation,
          changes.hosted.from,
          changes.hosted.to,
          base
        )
      : base,
  }))
}

function fieldVersions(
  schemaConflicts: readonly EidosSyncMergeConflict[],
  column: string
): MergeFieldVersions | null {
  for (const conflict of schemaConflicts) {
    const versions = schemaFieldVersions(conflict).find((item) =>
      [item.base, item.local, item.hosted].includes(column)
    )
    if (versions) return versions
  }
  return null
}

function VersionedFieldHeading({
  column,
  schemaConflicts,
}: {
  column: string
  schemaConflicts: readonly EidosSyncMergeConflict[]
}) {
  const versions = fieldVersions(schemaConflicts, column)
  if (!versions) return <span>{column}</span>
  return (
    <span className="merge-table-versioned-field">
      <span data-field-version="base">
        <small>Base</small>
        {versions.base}
      </span>
      <span data-field-version="local">
        <small>Local</small>
        {versions.local}
      </span>
      <span data-field-version="hosted">
        <small>Hosted</small>
        {versions.hosted}
      </span>
    </span>
  )
}

function TableSchemaConflicts({
  conflicts,
}: {
  conflicts: readonly EidosSyncMergeConflict[]
}) {
  if (conflicts.length === 0) return null
  return (
    <div className="merge-table-schema-conflicts" role="note">
      <header>
        <AlertTriangle />
        <strong>
          {conflicts.length.toLocaleString()} incompatible schema{" "}
          {conflicts.length === 1 ? "change" : "changes"}
        </strong>
        <span>Choose the complete Local or Hosted Eidos File.</span>
      </header>
      {conflicts.flatMap((conflict) =>
        schemaFieldVersions(conflict).map((versions) => (
          <div
            className="merge-table-schema-field"
            data-merge-table-schema-conflict={conflict.id}
            key={`${conflict.id}:${versions.base}`}
          >
            <span data-field-version="base">
              <small>Base</small>
              <strong>{versions.base}</strong>
            </span>
            <span data-field-version="local">
              <small>Local</small>
              <strong>{versions.local}</strong>
            </span>
            <span data-field-version="hosted">
              <small>Hosted</small>
              <strong>{versions.hosted}</strong>
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function valueAt(
  conflict: EidosSyncMergeConflict,
  version: MergeRowVersion,
  column: string
): unknown {
  const cell = cellConflictFor(conflict, column)
  if (cell) {
    if (version === "base") return cell.base
    return version === "local" ? cell.local : cell.hosted
  }
  const index = conflictColumns(conflict).indexOf(column)
  return index < 0 ? undefined : rowFor(conflict, version)?.[index]
}

function cellConflictFor(conflict: EidosSyncMergeConflict, column: string) {
  return conflict.cells?.find((cell) => cell.column === column)
}

function isSystemColumn(column: string): boolean {
  return column.startsWith("_")
}

function labelColumn(conflict: EidosSyncMergeConflict): string | undefined {
  const columns = conflictColumns(conflict)
  const row = conflict.baseRow ?? conflict.oursRow ?? conflict.theirsRow ?? []
  return columns.find(
    (column, index) =>
      !isSystemColumn(column) &&
      typeof row[index] === "string" &&
      String(row[index]).trim().length > 0
  )
}

function defaultColumns(group: MergeTableGroup): string[] {
  const changed = group.columns.filter((column) =>
    group.conflicts.some((conflict) => {
      const base = valueAt(conflict, "base", column)
      const local = valueAt(conflict, "local", column)
      const hosted = valueAt(conflict, "hosted", column)
      return (
        !valuesEqual(base, local) ||
        !valuesEqual(base, hosted) ||
        !valuesEqual(local, hosted)
      )
    })
  )
  const visible = new Set(changed)
  if (!group.name.startsWith("eidos__")) {
    group.conflicts.forEach((conflict) => {
      const column = labelColumn(conflict)
      if (column) visible.add(column)
    })
  }
  const businessColumns = group.columns.filter(
    (column) => visible.has(column) && !isSystemColumn(column)
  )
  return businessColumns.length > 0 ? businessColumns : changed
}

function identityFor(conflict: EidosSyncMergeConflict): {
  label: string
  detail: string
} {
  const columns = conflictColumns(conflict)
  const base = conflict.baseRow ?? conflict.oursRow ?? conflict.theirsRow ?? []
  const labelIndex = columns.indexOf(labelColumn(conflict) ?? "")
  const identity =
    conflict.key ??
    conflict.oursKey ??
    conflict.theirsKey ??
    (Number.isSafeInteger(conflict.rowid)
      ? { rowid: conflict.rowid }
      : Number.isSafeInteger(conflict.oursRowid)
        ? { rowid: conflict.oursRowid }
        : Number.isSafeInteger(conflict.theirsRowid)
          ? { rowid: conflict.theirsRowid }
          : {})
  const identityEntries = Object.entries(identity)
  const detail = identityEntries.length
    ? identityEntries
        .map(([field, value]) => `${field}=${displayValue(value)}`)
        .join(" · ")
    : "No stable identity"
  return {
    label:
      labelIndex >= 0
        ? displayValue(base[labelIndex])
        : identityEntries.length
          ? identityEntries.map(([, value]) => displayValue(value)).join(" · ")
          : "Row conflict",
    detail,
  }
}

function MergeValue({ value }: { value: unknown }) {
  const text = displayValue(value)
  return (
    <span
      className="version-table-value"
      data-value-kind={value === null ? "null" : typeof value}
      title={text}
    >
      {text}
    </span>
  )
}

function versionLabel(version: MergeRowVersion): string {
  if (version === "base") return "Base"
  return version === "local" ? "Local" : "Hosted"
}

function versionOperation(
  conflict: EidosSyncMergeConflict,
  version: MergeRowVersion
): string | undefined {
  if (version === "local") return conflict.oursOperation
  if (version === "hosted") return conflict.theirsOperation
  return undefined
}

function humanize(value: string): string {
  return value.replaceAll("_", " ")
}

function resolutionLabel(
  resolution: EidosSyncMergeConflict["resolution"]
): string {
  if (resolution === "ours") return "Local"
  if (resolution === "theirs") return "Hosted"
  return "selected result"
}

export function MergeTableDiff({
  conflicts,
  schemaConflicts = [],
  showBase,
  disabled,
  identityKey,
  pendingResolution = null,
  pendingCellResolution = null,
  pendingTableResolution = null,
  unsafeTables = new Set<string>(),
  onResolveRow,
  onResolveCell,
  onResolveTable,
}: {
  conflicts: EidosSyncMergeConflict[]
  schemaConflicts?: EidosSyncMergeConflict[]
  showBase: boolean
  disabled: boolean
  identityKey: string
  pendingResolution?: {
    conflictId: string
    result: "ours" | "theirs"
  } | null
  pendingCellResolution?: {
    conflictId: string
    column: string
    result: "ours" | "theirs"
  } | null
  pendingTableResolution?: {
    table: string
    result: "ours" | "theirs"
  } | null
  unsafeTables?: ReadonlySet<string>
  onResolveRow(
    conflict: EidosSyncMergeConflict,
    result: "ours" | "theirs"
  ): void
  onResolveCell?(
    conflict: EidosSyncMergeConflict,
    column: string,
    result: "ours" | "theirs"
  ): void
  onResolveTable(table: string, result: "ours" | "theirs"): void
}) {
  const [fieldMode, setFieldMode] = useState<FieldMode>("changed")
  const groups = useMemo(
    () => groupConflicts(conflicts, schemaConflicts),
    [conflicts, schemaConflicts]
  )
  const conflictCount = groups.reduce(
    (total, group) => total + group.conflicts.length,
    0
  )
  const resolvedCount = conflicts.filter(
    (conflict) => conflict.status === "resolved"
  ).length
  const unresolvedCount = conflictCount - resolvedCount
  const schemaConflictCount = groups.reduce(
    (total, group) => total + group.schemaConflicts.length,
    0
  )

  useEffect(() => setFieldMode("changed"), [identityKey])

  return (
    <section className="merge-table-conflicts" data-merge-table-conflicts>
      <header className="version-inspector-diff-bar version-text-diff-toolbar merge-table-toolbar">
        <div className="version-table-diff-toolbar-summary">
          <strong>
            {schemaConflictCount > 0 ? "Table conflicts" : "Row conflicts"}
          </strong>
          <span>
            {unresolvedCount.toLocaleString()} unresolved ·{" "}
            {resolvedCount.toLocaleString()} resolved
            {schemaConflictCount > 0
              ? ` · ${schemaConflictCount.toLocaleString()} schema`
              : ""}{" "}
            · {groups.length.toLocaleString()}{" "}
            {groups.length === 1 ? "table" : "tables"}
          </span>
        </div>
        <div
          className="version-text-diff-layout"
          aria-label="Visible conflict fields"
        >
          <button
            type="button"
            aria-pressed={fieldMode === "changed"}
            onClick={() => setFieldMode("changed")}
          >
            Changed fields
          </button>
          <button
            type="button"
            aria-pressed={fieldMode === "all"}
            onClick={() => setFieldMode("all")}
          >
            All fields
          </button>
        </div>
      </header>

      {groups.map((group) => {
        const changed = defaultColumns(group)
        const groupResolvedCount = group.conflicts.filter(
          (conflict) => conflict.status === "resolved"
        ).length
        const groupUnresolvedCount = group.conflicts.length - groupResolvedCount
        const groupResolution =
          groupUnresolvedCount === 0 &&
          group.conflicts.every(
            (conflict) => conflict.resolution === group.conflicts[0]?.resolution
          )
            ? group.conflicts[0]?.resolution
            : undefined
        const unsafeTable =
          unsafeTables.has(group.name) || group.schemaConflicts.length > 0
        const visibleColumns =
          fieldMode === "all" || changed.length === 0 ? group.columns : changed
        return (
          <section
            className="merge-table-group"
            data-merge-table={group.name}
            data-merge-table-status={
              groupUnresolvedCount === 0 ? "resolved" : "unresolved"
            }
            key={group.name}
          >
            <header>
              <div>
                <strong>{group.name}</strong>
                {group.name.startsWith("eidos__") ? (
                  <small>System</small>
                ) : null}
                {group.schemaConflicts.length > 0 ? (
                  <span className="merge-table-status" data-status="schema">
                    {group.schemaConflicts.length.toLocaleString()} schema
                    conflict
                  </span>
                ) : null}
                {groupUnresolvedCount === 0 ? (
                  <span
                    className="merge-table-status"
                    data-merge-table-resolution="resolved"
                  >
                    <Check /> Resolved
                  </span>
                ) : groupResolvedCount > 0 ? (
                  <span className="merge-table-status">
                    {groupResolvedCount.toLocaleString()} of{" "}
                    {group.conflicts.length.toLocaleString()} resolved
                  </span>
                ) : null}
              </div>
              <div className="merge-table-group-actions">
                <span>
                  {group.conflicts.length.toLocaleString()}{" "}
                  {group.conflicts.length === 1 ? "row" : "rows"} ·{" "}
                  {visibleColumns.length.toLocaleString()} of{" "}
                  {group.columns.length.toLocaleString()} fields
                </span>
                <button
                  type="button"
                  disabled={
                    disabled || unsafeTable || groupResolution === "ours"
                  }
                  aria-busy={
                    pendingTableResolution?.table === group.name &&
                    pendingTableResolution.result === "ours"
                  }
                  aria-pressed={groupResolution === "ours"}
                  title={
                    unsafeTable
                      ? "Resolve the schema or opaque conflict at the File level"
                      : undefined
                  }
                  onClick={() => onResolveTable(group.name, "ours")}
                >
                  {pendingTableResolution?.table === group.name &&
                  pendingTableResolution.result === "ours" ? (
                    <LoaderCircle className="spin" />
                  ) : groupResolution === "ours" ? (
                    <Check />
                  ) : null}
                  {groupResolution === "ours"
                    ? "Using Local Table"
                    : "Use Local Table"}
                </button>
                <button
                  type="button"
                  disabled={
                    disabled || unsafeTable || groupResolution === "theirs"
                  }
                  aria-busy={
                    pendingTableResolution?.table === group.name &&
                    pendingTableResolution.result === "theirs"
                  }
                  aria-pressed={groupResolution === "theirs"}
                  title={
                    unsafeTable
                      ? "Resolve the schema or opaque conflict at the File level"
                      : undefined
                  }
                  onClick={() => onResolveTable(group.name, "theirs")}
                >
                  {pendingTableResolution?.table === group.name &&
                  pendingTableResolution.result === "theirs" ? (
                    <LoaderCircle className="spin" />
                  ) : groupResolution === "theirs" ? (
                    <Check />
                  ) : null}
                  {groupResolution === "theirs"
                    ? "Using Hosted Table"
                    : "Use Hosted Table"}
                </button>
              </div>
            </header>
            <TableSchemaConflicts conflicts={group.schemaConflicts} />
            {group.conflicts.length > 0 ? (
              <div className="version-table-diff merge-table-diff">
                <div className="version-table-diff-viewport">
                  <table>
                    <caption>Merge conflicts in {group.name}</caption>
                    <thead>
                      <tr>
                        <th className="version-table-change-column" scope="col">
                          Version
                        </th>
                        <th className="version-table-key-column" scope="col">
                          Row
                        </th>
                        {visibleColumns.map((column) => (
                          <th key={column} scope="col">
                            <VersionedFieldHeading
                              column={column}
                              schemaConflicts={group.schemaConflicts}
                            />
                            {isSystemColumn(column) ? (
                              <small>System</small>
                            ) : null}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {group.conflicts.map((conflict) => {
                      const identity = identityFor(conflict)
                      const rowResolved = conflict.status === "resolved"
                      const versions: MergeRowVersion[] = showBase
                        ? ["base", "local", "hosted"]
                        : ["local", "hosted"]
                      return (
                        <tbody
                          data-merge-conflict-row={conflict.id}
                          data-merge-conflict-status={conflict.status}
                          data-merge-conflict-resolution={conflict.resolution}
                          key={conflict.id}
                        >
                          {versions.map((version, versionIndex) => {
                            const operation = versionOperation(
                              conflict,
                              version
                            )
                            const result =
                              version === "local" ? "ours" : "theirs"
                            const selected =
                              version !== "base" &&
                              rowResolved &&
                              conflict.resolution === result
                            const pending =
                              version !== "base" &&
                              pendingResolution?.conflictId === conflict.id &&
                              pendingResolution.result === result
                            return (
                              <tr
                                data-merge-row-version={version}
                                key={version}
                              >
                                <th
                                  className="version-table-change-column merge-table-version-cell"
                                  scope="row"
                                >
                                  <div className="merge-table-version-control">
                                    <span className="merge-table-version-copy">
                                      <span>{versionLabel(version)}</span>
                                      {operation ? (
                                        <small>{humanize(operation)}</small>
                                      ) : null}
                                    </span>
                                    {version !== "base" ? (
                                      <button
                                        type="button"
                                        disabled={
                                          disabled || unsafeTable || selected
                                        }
                                        title={
                                          unsafeTable
                                            ? "Choose a complete Local or Hosted Eidos File for this schema conflict"
                                            : undefined
                                        }
                                        aria-busy={pending}
                                        aria-label={`Use ${versionLabel(version)} row for ${identity.label}`}
                                        aria-pressed={selected}
                                        data-merge-selection={
                                          selected
                                            ? "selected"
                                            : pending
                                              ? "pending"
                                              : undefined
                                        }
                                        onClick={() =>
                                          onResolveRow(conflict, result)
                                        }
                                      >
                                        {pending ? (
                                          <LoaderCircle className="spin" />
                                        ) : selected ? (
                                          <Check />
                                        ) : null}
                                        {pending
                                          ? `Saving ${versionLabel(version)}…`
                                          : selected
                                            ? `Using ${versionLabel(version)}`
                                            : `Use ${versionLabel(version)}`}
                                      </button>
                                    ) : null}
                                  </div>
                                </th>
                                {versionIndex === 0 ? (
                                  <th
                                    className="version-table-key-column merge-table-row-identity"
                                    scope="rowgroup"
                                    rowSpan={versions.length}
                                  >
                                    <span title={identity.label}>
                                      {identity.label}
                                    </span>
                                    <small title={identity.detail}>
                                      {identity.detail}
                                    </small>
                                    <small
                                      className="merge-table-row-status"
                                      data-status={conflict.status}
                                    >
                                      {rowResolved
                                        ? `Resolved with ${resolutionLabel(conflict.resolution)}`
                                        : humanize(conflict.reason)}
                                    </small>
                                  </th>
                                ) : null}
                                {visibleColumns.map((column) => {
                                  const cellConflict = cellConflictFor(
                                    conflict,
                                    column
                                  )
                                  const value = valueAt(
                                    conflict,
                                    version,
                                    column
                                  )
                                  const base = valueAt(conflict, "base", column)
                                  const local = valueAt(
                                    conflict,
                                    "local",
                                    column
                                  )
                                  const hosted = valueAt(
                                    conflict,
                                    "hosted",
                                    column
                                  )
                                  const changedFromBase = !valuesEqual(
                                    value,
                                    base
                                  )
                                  const sidesDisagree = !valuesEqual(
                                    local,
                                    hosted
                                  )
                                  const cellResult =
                                    version === "local" ? "ours" : "theirs"
                                  const cellSelected =
                                    version !== "base" &&
                                    cellConflict?.resolution === cellResult
                                  const cellPending =
                                    version !== "base" &&
                                    pendingCellResolution?.conflictId ===
                                      conflict.id &&
                                    pendingCellResolution.column === column &&
                                    pendingCellResolution.result === cellResult
                                  return (
                                    <td
                                      data-cell-change={
                                        version === "base"
                                          ? "base"
                                          : changedFromBase
                                            ? version
                                            : "unchanged"
                                      }
                                      data-cell-conflict={
                                        version !== "base" &&
                                        (cellConflict ||
                                          (sidesDisagree && !rowResolved))
                                          ? "true"
                                          : undefined
                                      }
                                      data-cell-resolution={
                                        cellConflict?.resolution
                                      }
                                      key={column}
                                    >
                                      <div className="merge-table-cell-control">
                                        <MergeValue value={value} />
                                        {version !== "base" &&
                                        cellConflict &&
                                        onResolveCell ? (
                                          <button
                                            type="button"
                                            disabled={
                                              disabled ||
                                              unsafeTable ||
                                              cellSelected
                                            }
                                            aria-busy={cellPending}
                                            aria-pressed={cellSelected}
                                            aria-label={`Use ${versionLabel(version)} value for ${column} in ${identity.label}`}
                                            data-merge-cell-selection={
                                              cellSelected
                                                ? "selected"
                                                : cellPending
                                                  ? "pending"
                                                  : undefined
                                            }
                                            onClick={() =>
                                              onResolveCell(
                                                conflict,
                                                column,
                                                cellResult
                                              )
                                            }
                                          >
                                            {cellPending ? (
                                              <LoaderCircle className="spin" />
                                            ) : cellSelected ? (
                                              <Check />
                                            ) : null}
                                            {cellPending
                                              ? "Saving…"
                                              : cellSelected
                                                ? `Using ${versionLabel(version)}`
                                                : `Use ${versionLabel(version)}`}
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        )
      })}
    </section>
  )
}
