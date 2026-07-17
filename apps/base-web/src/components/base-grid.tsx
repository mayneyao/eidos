import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowQuery,
  BaseRowValue,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LoaderCircle, Plus } from "lucide-react"

import type { BaseEditorDataSource } from "../runtime/worker-client"

const ROW_HEIGHT = 36
const PAGE_SIZE = 100

interface BaseGridProps {
  source: BaseEditorDataSource
  table: BaseTableSnapshot
  view?: BaseViewInfo
  search: string
  disabled?: boolean
  onMutation: (result: BaseRowMutationResult) => void
  onFieldOpen: (field: BaseFieldInfo) => void
  onError: (error: unknown) => void
}

function visibleSystemFields(view?: BaseViewInfo): ReadonlySet<string> {
  const configured = view?.properties?.visibleSystemFields
  return new Set(
    Array.isArray(configured)
      ? configured.filter((value): value is string => typeof value === "string")
      : []
  )
}

export function fieldsForBaseView(
  fields: BaseFieldInfo[],
  view?: BaseViewInfo
): BaseFieldInfo[] {
  const hidden = new Set(view?.hiddenFields ?? [])
  const visibleSystem = visibleSystemFields(view)
  return fields
    .filter((field) => {
      if (field.valueKind === "system" && field.type !== "title") {
        return visibleSystem.has(field.tableColumnName)
      }
      return (
        !field.isHidden &&
        !hidden.has(field.tableColumnName) &&
        (field.tableColumnName === "title" ||
          field.valueKind === "source" ||
          field.valueKind === "relation" ||
          field.valueKind === "derived")
      )
    })
    .sort(
      (left, right) =>
        (view?.orderMap?.[left.tableColumnName] ?? Number.MAX_SAFE_INTEGER) -
        (view?.orderMap?.[right.tableColumnName] ?? Number.MAX_SAFE_INTEGER)
    )
}

function gridValue(value: BaseRowValue | undefined): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function portableListDisplay(value: BaseRowValue | undefined): string {
  if (typeof value !== "string") return gridValue(value)
  try {
    const decoded: unknown = JSON.parse(value)
    if (Array.isArray(decoded)) {
      return decoded
        .map((item) => (typeof item === "string" ? item : String(item)))
        .join(", ")
    }
  } catch {
    // Plain strings are already suitable for the read-only fallback display.
  }
  return value
}

function relationDisplay(field: BaseFieldInfo, row: BaseRow): string {
  const display = row[`${field.tableColumnName}__display`]
  if (typeof display === "string") {
    try {
      const values = JSON.parse(display) as Array<{ title?: unknown }>
      return values
        .map((value) =>
          typeof value.title === "string" ? value.title : "Missing record"
        )
        .join(", ")
    } catch {
      // Fall through to portable relation IDs.
    }
  }
  return portableListDisplay(row[field.tableColumnName])
}

function displayValue(field: BaseFieldInfo, row: BaseRow): string {
  const value = row[field.tableColumnName]
  if (field.type === "checkbox") {
    return value === true || value === 1 || value === "1" ? "Checked" : ""
  }
  if (field.type === "link") return relationDisplay(field, row)
  if (field.type === "file") return portableListDisplay(value)
  if (field.type === "select" && typeof value === "string") {
    const options = Array.isArray(field.property?.options)
      ? field.property.options
      : []
    const option = options.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "id" in candidate &&
        candidate.id === value
    )
    if (option && "name" in option && typeof option.name === "string") {
      return option.name
    }
  }
  return gridValue(value)
}

function isEditableField(field: BaseFieldInfo): boolean {
  return (
    !field.isDerived &&
    (field.tableColumnName === "title" || field.valueKind === "source") &&
    ![
      "created-time",
      "created-by",
      "last-edited-time",
      "last-edited-by",
      "row-id",
      "file",
    ].includes(field.type)
  )
}

function valueFromInput(field: BaseFieldInfo, value: string): BaseRowValue {
  if (value === "") return null
  if (field.type === "number" || field.type === "rating") {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  return value
}

function moveGridFocus(rowIndex: number, columnIndex: number): void {
  const target = document.querySelector<HTMLElement>(
    `[data-grid-cell="${rowIndex}:${columnIndex}"]`
  )
  target?.focus()
}

interface GridCellProps {
  field: BaseFieldInfo
  row: BaseRow
  rowIndex: number
  columnIndex: number
  disabled: boolean
  onCommit: (value: BaseRowValue) => Promise<void>
}

function GridCell({
  field,
  row,
  rowIndex,
  columnIndex,
  disabled,
  onCommit,
}: GridCellProps) {
  const editable = !disabled && isEditableField(field)
  const original = gridValue(row[field.tableColumnName])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(original)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (!editing) setDraft(original)
  }, [editing, original])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(
    async (next: BaseRowValue) => {
      if (next === row[field.tableColumnName]) {
        setEditing(false)
        return
      }
      setPending(true)
      try {
        await onCommit(next)
        setEditing(false)
      } finally {
        setPending(false)
      }
    },
    [field.tableColumnName, onCommit, row]
  )

  if (field.type === "checkbox" && editable) {
    const checked =
      row[field.tableColumnName] === true ||
      row[field.tableColumnName] === 1 ||
      row[field.tableColumnName] === "1"
    return (
      <button
        type="button"
        className="grid-cell grid-checkbox"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${field.name}: ${checked ? "checked" : "unchecked"}`}
        data-grid-cell={`${rowIndex}:${columnIndex}`}
        disabled={pending}
        onClick={() => void commit(!checked)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown")
            moveGridFocus(rowIndex + 1, columnIndex)
          if (event.key === "ArrowUp") moveGridFocus(rowIndex - 1, columnIndex)
          if (event.key === "ArrowRight")
            moveGridFocus(rowIndex, columnIndex + 1)
          if (event.key === "ArrowLeft")
            moveGridFocus(rowIndex, columnIndex - 1)
        }}
      >
        <span className={checked ? "checkbox-mark checked" : "checkbox-mark"}>
          {checked ? "✓" : ""}
        </span>
      </button>
    )
  }

  if (editing && editable) {
    const selectOptions =
      field.type === "select" && Array.isArray(field.property?.options)
        ? field.property.options.flatMap((candidate) =>
            typeof candidate === "object" &&
            candidate !== null &&
            "id" in candidate &&
            typeof candidate.id === "string" &&
            "name" in candidate &&
            typeof candidate.name === "string"
              ? [{ id: candidate.id, name: candidate.name }]
              : []
          )
        : []
    const common = {
      className: "grid-cell-input",
      value: draft,
      disabled: pending,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
      ) => setDraft(event.target.value),
      onBlur: () => void commit(valueFromInput(field, draft)),
      onKeyDown: (
        event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
      ) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setDraft(original)
          setEditing(false)
        }
      },
      "aria-label": field.name,
    }
    return (
      <div className="grid-cell editing">
        {selectOptions.length > 0 ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            {...common}
          >
            <option value="">None</option>
            {selectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            {...common}
            type={
              field.type === "number" || field.type === "rating"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : field.type === "datetime"
                    ? "datetime-local"
                    : "text"
            }
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={`grid-cell${editable ? " editable" : " readonly"}`}
      tabIndex={0}
      role="gridcell"
      data-grid-cell={`${rowIndex}:${columnIndex}`}
      title={displayValue(field, row)}
      onDoubleClick={() => editable && setEditing(true)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === "F2") && editable) {
          event.preventDefault()
          setEditing(true)
        } else if (event.key === "ArrowDown") {
          moveGridFocus(rowIndex + 1, columnIndex)
        } else if (event.key === "ArrowUp") {
          moveGridFocus(rowIndex - 1, columnIndex)
        } else if (event.key === "ArrowRight") {
          moveGridFocus(rowIndex, columnIndex + 1)
        } else if (event.key === "ArrowLeft") {
          moveGridFocus(rowIndex, columnIndex - 1)
        }
      }}
    >
      <span className="grid-cell-value">{displayValue(field, row)}</span>
      {pending ? (
        <LoaderCircle className="cell-spinner" aria-hidden="true" />
      ) : null}
    </div>
  )
}

export function BaseGrid({
  source,
  table,
  view,
  search,
  disabled = false,
  onMutation,
  onFieldOpen,
  onError,
}: BaseGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedPagesRef = useRef(new Set<number>())
  const generationRef = useRef(0)
  const [rows, setRows] = useState<Map<number, BaseRow>>(() => new Map())
  const [rowCount, setRowCount] = useState(table.rowCount)
  const [loading, setLoading] = useState(false)
  const fields = useMemo(
    () => fieldsForBaseView(table.fields, view),
    [table.fields, view]
  )
  const query = useMemo<BaseRowQuery>(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(view?.filter ? { filter: view.filter } : {}),
      ...(view?.sorts.length ? { sorts: view.sorts } : {}),
    }),
    [search, view?.filter, view?.sorts]
  )
  const columnTemplate = useMemo(
    () =>
      fields
        .map((field, index) =>
          index === 0 || field.type === "title"
            ? "minmax(220px, 1.5fr)"
            : "180px"
        )
        .join(" "),
    [fields]
  )
  const minimumWidth = Math.max(640, 260 + Math.max(0, fields.length - 1) * 180)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    paddingStart: ROW_HEIGHT,
  })
  const virtualRows = virtualizer.getVirtualItems()

  const loadPage = useCallback(
    async (pageIndex: number, generation: number) => {
      if (loadedPagesRef.current.has(pageIndex)) return
      loadedPagesRef.current.add(pageIndex)
      setLoading(true)
      try {
        const offset = pageIndex * PAGE_SIZE
        const page = await source.getPage(
          table.table.id,
          offset,
          PAGE_SIZE,
          query,
          search.trim() ? undefined : table.rowCount
        )
        if (generation !== generationRef.current) return
        setRowCount(page.total)
        setRows((current) => {
          const next = new Map(current)
          page.rows.forEach((row, index) => next.set(offset + index, row))
          return next
        })
      } catch (error) {
        loadedPagesRef.current.delete(pageIndex)
        onError(error)
      } finally {
        if (generation === generationRef.current) setLoading(false)
      }
    },
    [onError, query, search, source, table.rowCount, table.table.id]
  )

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    loadedPagesRef.current.clear()
    setRows(new Map())
    setRowCount(search.trim() ? table.rowCount : table.rowCount)
    void loadPage(0, generation)
  }, [loadPage, search, table.rowCount, table.table.id, view?.id])

  const visiblePageKey = virtualRows
    .map((row) => Math.floor(row.index / PAGE_SIZE))
    .join(",")
  useEffect(() => {
    const generation = generationRef.current
    for (const pageIndex of new Set(
      virtualRows.map((row) => Math.floor(row.index / PAGE_SIZE))
    )) {
      void loadPage(pageIndex, generation)
    }
  }, [loadPage, visiblePageKey])

  const commitCell = useCallback(
    async (rowIndex: number, field: BaseFieldInfo, value: BaseRowValue) => {
      const previous = rows.get(rowIndex)
      if (!previous) return
      const optimistic = { ...previous, [field.tableColumnName]: value }
      setRows((current) => new Map(current).set(rowIndex, optimistic))
      try {
        const result = await source.updateRow(
          table.table.id,
          String(previous._id),
          { [field.tableColumnName]: value }
        )
        setRows((current) => new Map(current).set(rowIndex, result.row))
        onMutation(result)
      } catch (error) {
        setRows((current) => new Map(current).set(rowIndex, previous))
        onError(error)
        throw error
      }
    },
    [onError, onMutation, rows, source, table.table.id]
  )

  const addRow = useCallback(async () => {
    try {
      const result = await source.insertRow(table.table.id, { title: "" })
      loadedPagesRef.current.clear()
      setRows(new Map())
      setRowCount(result.rowCount)
      onMutation(result)
      const generation = ++generationRef.current
      await loadPage(
        Math.floor(Math.max(0, result.rowCount - 1) / PAGE_SIZE),
        generation
      )
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(Math.max(0, result.rowCount - 1), {
          align: "end",
        })
      )
    } catch (error) {
      onError(error)
    }
  }, [loadPage, onError, onMutation, source, table.table.id, virtualizer])

  if (fields.length === 0) {
    return (
      <div className="grid-empty">
        <p>No visible properties in this view.</p>
        <p>Choose another view or make a property visible in Eidos Desktop.</p>
      </div>
    )
  }

  return (
    <div className="base-grid-shell">
      <div
        className="base-grid-scroll"
        ref={scrollRef}
        role="grid"
        aria-rowcount={rowCount}
      >
        <div
          className="base-grid-canvas"
          style={{
            height: virtualizer.getTotalSize(),
            minWidth: minimumWidth,
          }}
        >
          <div
            className="grid-row grid-header"
            role="row"
            style={{ gridTemplateColumns: columnTemplate }}
          >
            {fields.map((field) => (
              <button
                type="button"
                className="grid-header-cell"
                role="columnheader"
                key={field.tableColumnName}
                onClick={() => onFieldOpen(field)}
                title={`Edit ${field.name} property`}
              >
                <span className="field-type-mark" aria-hidden="true">
                  {field.type === "title" ? "Aa" : field.type.slice(0, 2)}
                </span>
                <span>
                  {field.type === "row-id" ? "Record ID" : field.name}
                </span>
              </button>
            ))}
          </div>

          {virtualRows.map((virtualRow) => {
            const row = rows.get(virtualRow.index)
            return (
              <div
                className="grid-row"
                role="row"
                aria-rowindex={virtualRow.index + 1}
                key={virtualRow.key}
                style={{
                  gridTemplateColumns: columnTemplate,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row
                  ? fields.map((field, columnIndex) => (
                      <GridCell
                        key={field.tableColumnName}
                        field={field}
                        row={row}
                        rowIndex={virtualRow.index}
                        columnIndex={columnIndex}
                        disabled={disabled}
                        onCommit={(value) =>
                          commitCell(virtualRow.index, field, value)
                        }
                      />
                    ))
                  : fields.map((field) => (
                      <div
                        className="grid-cell grid-skeleton"
                        key={field.tableColumnName}
                      />
                    ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="grid-footer">
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => void addRow()}
        >
          <Plus size={14} aria-hidden="true" />
          New record
        </button>
        <span className="row-count" aria-live="polite">
          {loading
            ? "Loading records…"
            : `${rowCount.toLocaleString()} records`}
        </span>
      </div>
    </div>
  )
}
