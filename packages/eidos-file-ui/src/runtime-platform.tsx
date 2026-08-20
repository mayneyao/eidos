import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react"
import type {
  FieldDescriptor,
  FileEntry,
  GroupPage,
  LogicalValue,
  RowPage,
  ViewDescriptor,
} from "@eidos.space/eidos-file"

import {
  eidosUIPresentValue,
  eidosUIVisibleFields,
  type EidosUIKernel,
  type EidosUIKernelState,
} from "./kernel"
import {
  EidosFileUIProvider,
  useEidosFileUI,
  type AssetPresenter,
} from "./context"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"

export interface EidosUIRuntimeContextValue {
  kernel: EidosUIKernel
  state: EidosUIKernelState
}

const EidosUIRuntimeContext = createContext<EidosUIRuntimeContextValue | null>(
  null
)

export interface EidosUIRuntimeProviderProps {
  kernel: EidosUIKernel
  children: ReactNode
  themeName?: "light" | "dark"
  assetPresenter?: AssetPresenter<ReactNode>
  className?: string
  style?: CSSProperties
}

/** The normative React boundary: one exact UI kernel, no file path or SQL. */
export function EidosUIRuntimeProvider({
  kernel,
  children,
  themeName = "light",
  assetPresenter,
  className,
  style,
}: EidosUIRuntimeProviderProps) {
  const state = useSyncExternalStore(
    kernel.subscribe,
    kernel.getState,
    kernel.getState
  )
  const value = useMemo(() => ({ kernel, state }), [kernel, state])
  const assetSession = useMemo(
    () =>
      state.sessionId && state.hostState && state.hostServiceCapabilities
        ? {
            services: kernel.host,
            serviceCapabilities: state.hostServiceCapabilities,
            state: state.hostState,
          }
        : undefined,
    [
      kernel.host,
      state.hostServiceCapabilities,
      state.hostState,
      state.sessionId,
    ]
  )
  return (
    <EidosUIRuntimeContext.Provider value={value}>
      <EidosFileUIProvider
        themeName={themeName}
        assetSession={assetSession}
        assetPresenter={assetPresenter}
      >
        <div
          className={["eidos-file-root", className].filter(Boolean).join(" ")}
          data-eidos-file-root=""
          data-theme={themeName}
          style={style}
        >
          {children}
        </div>
      </EidosFileUIProvider>
    </EidosUIRuntimeContext.Provider>
  )
}

export function useEidosUIRuntime(): EidosUIRuntimeContextValue {
  const value = useContext(EidosUIRuntimeContext)
  if (!value) {
    throw new Error(
      "useEidosUIRuntime must be used inside EidosUIRuntimeProvider"
    )
  }
  return value
}

export interface EidosStandardViewProps {
  tableId?: string
  viewId?: string
  search?: string
  pageSize?: number
  className?: string
  renderEmpty?: (state: EidosUIKernelState) => ReactNode
}

/**
 * Accessible EU-Viewer-1.0 renderer for the four standard View types. All
 * rows, order, groups, derived values and Relation labels come from Runtime.
 */
export function EidosStandardView({
  tableId,
  viewId,
  search = "",
  pageSize = 100,
  className,
  renderEmpty,
}: EidosStandardViewProps) {
  const { kernel, state } = useEidosUIRuntime()
  const schema = state.schema
  const table =
    (tableId ? schema?.tables.get(tableId) : undefined) ??
    (state.snapshot?.defaultTableId
      ? schema?.tables.get(state.snapshot.defaultTableId)
      : undefined) ??
    schema?.tables.values().next().value
  const views = table ? (schema?.viewsByTable.get(table.id) ?? []) : []
  const view =
    (viewId ? schema?.views.get(viewId) : undefined) ??
    views.find((candidate) => candidate.type === "grid") ??
    views[0]
  const fields = table ? (schema?.fieldsByTable.get(table.id) ?? []) : []
  const visibleFields = table ? eidosUIVisibleFields(table, fields, view) : []
  const calendarDateField =
    view?.type === "calendar" && typeof view.layout.dateField === "string"
      ? fields.find((field) => field.id === view.layout.dateField)
      : undefined
  const projectedFields =
    calendarDateField &&
    !visibleFields.some((field) => field.id === calendarDateField.id)
      ? [...visibleFields, calendarDateField]
      : visibleFields
  const [cursor, setCursor] = useState<string | undefined>()
  const [direction, setDirection] = useState<"forward" | "backward">("forward")
  const [page, setPage] = useState<RowPage | null>(null)
  const [groups, setGroups] = useState<GroupPage | null>(null)
  const [error, setError] = useState<unknown>(null)
  const query = useMemo(
    () => runtimeQuery(view, search, visibleFields),
    [search, view, visibleFields]
  )
  const projection = useMemo(
    () => ({
      fields: projectedFields.map((field) => field.id),
      resolveRelations: projectedFields
        .filter((field) => field.kind === "relation")
        .map((field) => field.id),
    }),
    [projectedFields]
  )
  const identity = `${state.snapshot?.revision ?? ""}:${table?.id ?? ""}:${view?.id ?? ""}:${search}`

  useEffect(() => {
    setCursor(undefined)
    setDirection("forward")
  }, [identity])

  useEffect(() => {
    if (!table || !view || state.phase !== "ready") {
      setPage(null)
      setGroups(null)
      return
    }
    let mounted = true
    setError(null)
    if (view.type === "kanban") {
      const groupField =
        typeof view.layout.groupField === "string"
          ? view.layout.groupField
          : null
      if (!groupField) {
        setGroups(null)
        return
      }
      void kernel
        .groupRows(`standard:${view.id}`, {
          tableId: table.id,
          query,
          groupBy: [groupField],
          aggregates: [],
          projection,
          groupLimit: Math.min(50, state.runtimeLimits?.groupPageSizeMax ?? 50),
          rowsPerGroup: Math.min(
            pageSize,
            state.runtimeLimits?.pageSizeMax ?? pageSize
          ),
          ...(cursor ? { cursor } : {}),
          direction,
        })
        .then((result) => {
          if (mounted && result) setGroups(result)
        })
        .catch((reason: unknown) => {
          if (mounted) setError(reason)
        })
      return () => {
        mounted = false
      }
    }
    void kernel
      .queryRows(`standard:${view.id}`, {
        tableId: table.id,
        query,
        projection,
        limit: Math.min(pageSize, state.runtimeLimits?.pageSizeMax ?? pageSize),
        ...(cursor ? { cursor } : {}),
        direction,
      })
      .then((result) => {
        if (mounted && result) setPage(result)
      })
      .catch((reason: unknown) => {
        if (mounted) setError(reason)
      })
    return () => {
      mounted = false
    }
  }, [
    cursor,
    direction,
    identity,
    kernel,
    pageSize,
    projection,
    query,
    state.phase,
    state.runtimeLimits,
    table,
    view,
  ])

  if (!table || !view || state.phase !== "ready") {
    return renderEmpty ? (
      renderEmpty(state)
    ) : (
      <div className={className} role="status">
        {state.phase === "opening"
          ? "Opening Eidos File…"
          : state.phase === "error"
            ? "The Eidos File could not be presented."
            : "Open an Eidos File to begin."}
      </div>
    )
  }
  if (!["grid", "gallery", "kanban", "calendar"].includes(view.type)) {
    return (
      <section className={className} aria-label={view.name}>
        <h2>{view.name}</h2>
        <p role="status">Unsupported View renderer: {view.type}</p>
      </section>
    )
  }
  if (error) {
    return (
      <div className={className} role="alert">
        {runtimeMessage(error)}
      </div>
    )
  }
  if (view.type === "kanban") {
    if (typeof view.layout.groupField !== "string") {
      return (
        <div className={className} role="status">
          Configure a group field to present this Kanban View.
        </div>
      )
    }
    return (
      <section className={className} aria-label={view.name}>
        <h2>{view.name}</h2>
        <div className="eidos-standard-kanban">
          {groups?.groups.map((group) => (
            <section
              key={group.key.map(eidosUIPresentValue).join("\u0000")}
              aria-label={group.key.map(eidosUIPresentValue).join(", ")}
            >
              <h3>
                {group.key.map(eidosUIPresentValue).join(", ")} ({group.count})
              </h3>
              {group.rows.map((row) => (
                <article key={row.id}>
                  <strong>
                    {rowLabel(row.values, visibleFields, table.labelFieldId)}
                  </strong>
                  {cardValues(row.values, visibleFields, view).map((item) => (
                    <div key={item.field.id}>
                      <span>{item.field.name}: </span>
                      <RuntimeValue field={item.field} value={item.value} />
                    </div>
                  ))}
                </article>
              ))}
            </section>
          ))}
        </div>
        <Pagination
          next={groups?.nextCursor ?? null}
          previous={groups?.previousCursor ?? null}
          onMove={(nextCursor, nextDirection) => {
            setCursor(nextCursor)
            setDirection(nextDirection)
          }}
        />
      </section>
    )
  }
  if (view.type === "gallery") {
    return (
      <section className={className} aria-label={view.name}>
        <h2>{view.name}</h2>
        <div className="eidos-standard-gallery">
          {page?.rows.map((row) => (
            <article key={row.id}>
              <strong>
                {rowLabel(row.values, visibleFields, table.labelFieldId)}
              </strong>
              {cardValues(row.values, visibleFields, view).map((item) => (
                <div key={item.field.id}>
                  <span>{item.field.name}: </span>
                  <RuntimeValue field={item.field} value={item.value} />
                </div>
              ))}
            </article>
          ))}
        </div>
        <Pagination
          next={page?.nextCursor ?? null}
          previous={page?.previousCursor ?? null}
          onMove={(nextCursor, nextDirection) => {
            setCursor(nextCursor)
            setDirection(nextDirection)
          }}
        />
      </section>
    )
  }
  if (view.type === "calendar") {
    const dateFieldId =
      typeof view.layout.dateField === "string" ? view.layout.dateField : null
    const dateFieldIndex = projectedFields.findIndex(
      (field) => field.id === dateFieldId
    )
    if (!dateFieldId || dateFieldIndex < 0) {
      return (
        <div className={className} role="status">
          Configure a date field to present this Calendar View.
        </div>
      )
    }
    const rowsByDate = new Map<string, NonNullable<typeof page>["rows"]>()
    for (const row of page?.rows ?? []) {
      const raw = row.values[dateFieldIndex]
      const key = runtimeCalendarDateKey(raw)
      if (!key) continue
      const rows = rowsByDate.get(key)
      if (rows) rows.push(row)
      else rowsByDate.set(key, [row])
    }
    return (
      <section className={className} aria-label={view.name}>
        <h2>{view.name}</h2>
        <div className="eidos-standard-calendar">
          {[...rowsByDate.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, rows]) => (
              <section key={date} aria-label={date}>
                <h3>
                  <time dateTime={date}>{date}</time>
                </h3>
                {rows.map((row) => (
                  <article key={row.id}>
                    {rowLabel(row.values, projectedFields, table.labelFieldId)}
                  </article>
                ))}
              </section>
            ))}
        </div>
        <Pagination
          next={page?.nextCursor ?? null}
          previous={page?.previousCursor ?? null}
          onMove={(nextCursor, nextDirection) => {
            setCursor(nextCursor)
            setDirection(nextDirection)
          }}
        />
      </section>
    )
  }
  return (
    <section className={className} aria-label={view.name}>
      <h2>{view.name}</h2>
      <div role="region" aria-label={`${view.name} data`} tabIndex={0}>
        <table>
          <thead>
            <tr>
              {visibleFields.map((field) => (
                <th key={field.id} scope="col">
                  {field.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page?.rows.map((row) => (
              <tr key={row.id}>
                {row.values.map((value, index) => (
                  <td key={visibleFields[index]!.id}>
                    <RuntimeValue field={visibleFields[index]!} value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        next={page?.nextCursor ?? null}
        previous={page?.previousCursor ?? null}
        onMove={(nextCursor, nextDirection) => {
          setCursor(nextCursor)
          setDirection(nextDirection)
        }}
      />
    </section>
  )
}

function isRuntimeFileEntry(value: LogicalValue): value is FileEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.mediaType === "string" &&
    typeof value.size === "string" &&
    typeof value.uri === "string"
  )
}

function runtimeCalendarDateKey(
  value: LogicalValue | undefined
): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  const year = String(instant.getFullYear()).padStart(4, "0")
  const month = String(instant.getMonth() + 1).padStart(2, "0")
  const day = String(instant.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function RuntimeValue({
  field,
  value,
}: {
  field: FieldDescriptor
  value: LogicalValue
}) {
  const fileEntries =
    field.valueType === "file" ||
    (typeof field.valueType === "object" &&
      field.valueType.element === "file-entry")
      ? Array.isArray(value)
        ? value.filter(isRuntimeFileEntry)
        : []
      : field.valueType === "file-entry" && isRuntimeFileEntry(value)
        ? [value]
        : null
  if (fileEntries) {
    return fileEntries.length > 0 ? (
      <div className="grid gap-1">
        {fileEntries.map((entry) => (
          <EidosFileEntrySurface key={entry.id} entry={entry} compact />
        ))}
      </div>
    ) : (
      <>—</>
    )
  }
  return <>{eidosUIPresentValue(value)}</>
}

function Pagination({
  next,
  previous,
  onMove,
}: {
  next: string | null
  previous: string | null
  onMove(cursor: string, direction: "forward" | "backward"): void
}) {
  const { translate: t } = useEidosFileUI()
  if (!next && !previous) return null
  return (
    <nav aria-label={t("Result pages")}>
      <button
        type="button"
        disabled={!previous}
        onClick={() => previous && onMove(previous, "backward")}
      >
        {t("Previous")}
      </button>
      <button
        type="button"
        disabled={!next}
        onClick={() => next && onMove(next, "forward")}
      >
        {t("Next")}
      </button>
    </nav>
  )
}

function runtimeQuery(
  view: ViewDescriptor | undefined,
  search: string,
  fields: FieldDescriptor[]
) {
  return {
    ...(view?.query ?? {}),
    ...(search === ""
      ? {}
      : {
          search: {
            text: search,
            fields: fields
              .filter(
                (field) =>
                  typeof field.valueType === "string" &&
                  ["text", "url", "select", "row-id"].includes(field.valueType)
              )
              .map((field) => field.id),
          },
        }),
  }
}

function rowLabel(
  values: RowPage["rows"][number]["values"],
  fields: FieldDescriptor[],
  labelFieldId: string
): string {
  const index = fields.findIndex((field) => field.id === labelFieldId)
  return index < 0 ? "Untitled" : eidosUIPresentValue(values[index] ?? null)
}

function cardValues(
  values: RowPage["rows"][number]["values"],
  fields: FieldDescriptor[],
  view: ViewDescriptor
) {
  const requested = Array.isArray(view.layout.cardFields)
    ? new Set(
        view.layout.cardFields.filter(
          (value): value is string => typeof value === "string"
        )
      )
    : new Set<string>()
  return fields.flatMap((field, index) =>
    requested.has(field.id) ? [{ field, value: values[index] ?? null }] : []
  )
}

function runtimeMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return "The Runtime request failed."
}
