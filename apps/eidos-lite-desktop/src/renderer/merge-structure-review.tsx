import { useEffect, useState } from "react"
import type {
  EidosSyncMergeConflict,
  EidosSyncMergePath,
  EidosSyncMergeSqlitePreview,
  EidosSyncMergeSqliteVersion,
  EidosSyncMergeTablePreview,
  EidosSyncMergeSchemaPlan,
  EidosSyncMergeSchemaChoice,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"
import { MergeSchemaReview } from "./merge-schema-review"

type PreviewState = Partial<
  Record<
    EidosSyncMergeSqliteVersion,
    {
      value?: EidosSyncMergeSqlitePreview
      error?: string
    }
  >
>

function TablePreview({
  table,
  base,
  other,
}: {
  table: EidosSyncMergeTablePreview
  base?: EidosSyncMergeTablePreview
  other?: EidosSyncMergeTablePreview
}) {
  const { t } = useEidosLiteI18n()
  const removed = table.hasMoreFields
    ? []
    : (base?.fields.filter(
        (field) => !table.fields.some((current) => current.id === field.id)
      ) ?? [])
  const columns = table.fields.map((field) => {
    const original = base?.fields.find((candidate) => candidate.id === field.id)
    const counterpart = other?.fields.find(
      (candidate) => candidate.id === field.id
    )
    const changedFromBase = Boolean(
      base &&
      (!original ||
        original.name !== field.name ||
        original.type !== field.type)
    )
    const changedFromOther = Boolean(
      other &&
      (counterpart
        ? counterpart.name !== field.name || counterpart.type !== field.type
        : !other.hasMoreFields)
    )
    return { field, original, changed: changedFromBase || changedFromOther }
  })
  return (
    <section className="merge-structure-table" data-structure-table={table.id}>
      <header>
        <strong>{table.name}</strong>
      </header>
      <div
        className="merge-structure-table-scroll"
        role="region"
        aria-label={table.name}
        tabIndex={0}
      >
        <table
          aria-label={table.name}
          style={{ minWidth: `${table.fields.length * 6}rem` }}
        >
          <thead>
            <tr>
              {columns.map(({ field, original, changed }) => {
                const note =
                  original && original.name !== field.name
                    ? t("Was {name}", { name: original.name })
                    : original && original.type !== field.type
                      ? t("Type was {type}", { type: original.type })
                      : base && !original && !base.hasMoreFields
                        ? t("Added")
                        : ""
                return (
                  <th
                    key={field.id}
                    scope="col"
                    data-structure-column-changed={changed || undefined}
                    title={
                      original && original.name !== field.name
                        ? t("Renamed from {name}", { name: original.name })
                        : field.name
                    }
                  >
                    <span>{field.name}</span>
                    <small>{field.type}</small>
                    <small
                      className="merge-structure-column-before"
                      aria-hidden={!note}
                    >
                      {note || "\u00a0"}
                    </small>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                {columns.map(({ field, changed }, index) => (
                  <td
                    key={field.id}
                    title={row.cells[index]}
                    data-structure-column-changed={changed || undefined}
                  >
                    {row.cells[index] || (
                      <span className="merge-structure-empty-cell">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="merge-structure-table-note">
        {table.rows.length === 0
          ? t("No rows")
          : t(
              table.hasMoreRows
                ? "First {count} rows · read-only preview"
                : table.rows.length === 1
                  ? "1 row · read-only preview"
                  : "{count} rows · read-only preview",
              { count: table.rows.length }
            )}
        {table.hasMoreFields ? ` · ${t("First 64 fields")}` : ""}
      </p>
      {removed.length > 0 ? (
        <p className="merge-structure-table-note">
          {t("Removed fields")}: {removed.map((field) => field.name).join(", ")}
        </p>
      ) : null}
    </section>
  )
}

/** Each pane is reconstructed from that version's immutable Eidos File, never from a diff. */
export function MergeStructureReview({
  path,
  stateToken,
  conflicts,
  showBase,
  disabled,
  onResolvePath,
  onResolveSchema,
}: {
  path: EidosSyncMergePath
  stateToken: string
  conflicts: readonly EidosSyncMergeConflict[]
  showBase: boolean
  disabled: boolean
  onResolvePath(side: "ours" | "theirs"): void
  onResolveSchema?(choices: EidosSyncMergeSchemaChoice[]): void
}) {
  const { t } = useEidosLiteI18n()
  const [previews, setPreviews] = useState<PreviewState>({})
  const [retry, setRetry] = useState(0)
  const [schemaPlan, setSchemaPlan] = useState<EidosSyncMergeSchemaPlan | null>(
    null
  )
  const [planning, setPlanning] = useState(
    Boolean(window.eidosLite.readSyncMergeSchemaPlan)
  )
  const structure = conflicts.filter((conflict) => conflict.kind !== "row")
  const tableNames = JSON.stringify(
    [
      ...new Set(
        structure.flatMap((conflict) =>
          conflict.table
            ? [conflict.table]
            : conflict.kind === "schema" &&
                conflict.entryType === "table" &&
                conflict.name
              ? [conflict.name]
              : []
        )
      ),
    ].slice(0, 16)
  )
  useEffect(() => {
    let active = true
    const tables = JSON.parse(tableNames) as string[]
    const read = async (
      version: EidosSyncMergeSqliteVersion,
      selectedTables: string[]
    ) => {
      if (!window.eidosLite.readSyncMergeSqlitePreview) {
        setPreviews((current) => ({
          ...current,
          [version]: { error: "Table preview unavailable" },
        }))
        return undefined
      }
      try {
        const response = await window.eidosLite.readSyncMergeSqlitePreview({
          path: path.path,
          version,
          stateToken,
          tables: selectedTables,
        })
        if (!active) return undefined
        setPreviews((current) => ({
          ...current,
          [version]: response.ok
            ? { value: response.value }
            : { ...current[version], error: response.failure.message },
        }))
        return response.ok ? response.value : undefined
      } catch (error: unknown) {
        if (active)
          setPreviews((current) => ({
            ...current,
            [version]: {
              ...current[version],
              error:
                error instanceof Error
                  ? error.message
                  : "Table preview unavailable",
            },
          }))
        return undefined
      }
    }
    void (async () => {
      let plannedTables = tables
      if (
        onResolveSchema &&
        path.state !== "resolved" &&
        window.eidosLite.readSyncMergeSchemaPlan
      ) {
        setPlanning(true)
        try {
          const response = await window.eidosLite.readSyncMergeSchemaPlan({
            path: path.path,
            stateToken,
          })
          if (!active) return
          const tableIds = response.ok
            ? [...new Set(response.value.fields.map((field) => field.tableId))]
            : []
          const supported = response.ok && tableIds.length <= 16
          setSchemaPlan(supported ? response.value : null)
          if (supported && response.value.supported) plannedTables = tableIds
        } catch {
          if (active) setSchemaPlan(null)
        } finally {
          if (active) setPlanning(false)
        }
      } else {
        setSchemaPlan(null)
        setPlanning(false)
      }
      const base = await read("base", plannedTables)
      if (!active) return
      // Stable canonical table IDs still select a table after either side renames it.
      const selectedTables =
        plannedTables.length > 0
          ? [
              ...new Set([
                ...(base?.tables.map((table) => table.id) ?? []),
                ...plannedTables,
              ]),
            ].slice(0, 16)
          : []
      await Promise.all([
        read("ours", selectedTables),
        read("theirs", selectedTables),
      ])
    })()
    return () => {
      active = false
    }
  }, [path.path, path.state, stateToken, tableNames, retry])
  const resolved = path.state === "resolved"
  if (planning)
    return (
      <p className="merge-structure-preview-status" role="status">
        {t("Reviewing table structure…")}
      </p>
    )
  if (!resolved && schemaPlan?.supported && onResolveSchema) {
    return (
      <MergeSchemaReview
        key={stateToken}
        plan={schemaPlan}
        preview={previews.ours?.value}
        ready={Boolean(
          previews.ours?.value &&
          previews.theirs?.value &&
          !previews.ours?.error &&
          !previews.theirs?.error
        )}
        showBase={showBase}
        disabled={disabled}
        onResolve={onResolveSchema}
        onResolvePath={onResolvePath}
      />
    )
  }
  const recommendation = structure[0]?.recommendedResult
  const recommendedSide =
    (recommendation === "ours" || recommendation === "theirs") &&
    structure.every(
      (conflict) =>
        conflict.autoResolvable && conflict.recommendedResult === recommendation
    )
      ? recommendation
      : null
  const tableIds = [
    ...new Set(
      [
        ...(previews.ours?.value?.tables ?? []),
        ...(previews.theirs?.value?.tables ?? []),
      ].map((table) => table.id)
    ),
  ]
  const renderTables = (version: EidosSyncMergeSqliteVersion) => {
    const state = previews[version]
    if (!state)
      return (
        <p className="merge-structure-preview-status" role="status">
          {t("Loading table preview…")}
        </p>
      )
    if (!state.value)
      return (
        <div className="merge-structure-preview-status">
          <p>{t("Table preview unavailable")}</p>
          <button
            type="button"
            className="secondary-action"
            disabled={disabled}
            onClick={() => setRetry((current) => current + 1)}
          >
            {t("Retry")}
          </button>
        </div>
      )
    if (!state.value.present)
      return (
        <p className="merge-structure-preview-status">
          {t("File not present in this version")}
        </p>
      )
    const ids =
      version === "base"
        ? state.value.tables.map((table) => table.id)
        : tableIds
    if (ids.length === 0)
      return (
        <p className="merge-structure-preview-status">
          {t("No tables in this version")}
        </p>
      )
    return ids.map((id) => {
      const table = state.value!.tables.find((candidate) => candidate.id === id)
      const other = previews[
        version === "ours" ? "theirs" : "ours"
      ]?.value?.tables.find((candidate) => candidate.id === id)
      return table ? (
        <TablePreview
          key={id}
          table={table}
          base={
            version === "base"
              ? undefined
              : previews.base?.value?.tables.find(
                  (candidate) => candidate.id === id
                )
          }
          other={other}
        />
      ) : (
        <section className="merge-structure-table" key={id}>
          <header>
            <strong>{other?.name}</strong>
          </header>
          <p className="merge-structure-preview-status">
            {t("Table not present in this version")}
          </p>
        </section>
      )
    })
  }
  return (
    <section className="merge-structure-review" data-merge-structure-review>
      <header>
        <strong>
          {t(resolved ? "Compared file versions" : "Compare table structure")}
        </strong>
        <p>
          {t("Your choice keeps all tables, data and Views from that version.")}
        </p>
      </header>
      {showBase ? (
        <section className="merge-structure-base-preview">
          <header>
            <strong>{t("Base")}</strong>
          </header>
          {renderTables("base")}
        </section>
      ) : null}
      <div className="merge-structure-versions">
        {(["ours", "theirs"] as const).map((side) => (
          <section key={side} data-structure-side={side}>
            <header>
              <strong>
                {t(side === "ours" ? "Local changes" : "Incoming changes")}
              </strong>
              {!resolved ? (
                <button
                  type="button"
                  className="sync-merge-use-version"
                  disabled={disabled}
                  onClick={() => onResolvePath(side)}
                >
                  {t(side === "ours" ? "Use Local File" : "Use Incoming File")}
                </button>
              ) : null}
            </header>
            {recommendedSide === side && !resolved ? (
              <p className="merge-structure-recommendation">
                {t("Recommended: the other version has no logical changes")}
              </p>
            ) : null}
            {renderTables(side)}
          </section>
        ))}
      </div>
      <details className="merge-structure-technical">
        <summary>{t("Technical details")}</summary>
        <pre>
          {JSON.stringify(
            {
              conflicts,
              previewErrors: Object.fromEntries(
                Object.entries(previews).flatMap(([version, state]) =>
                  state?.error ? [[version, state.error]] : []
                )
              ),
            },
            null,
            2
          )}
        </pre>
      </details>
    </section>
  )
}
