import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DataEditor, {
  GridCellKind,
  type DataEditorProps,
  type GridCell,
  type GridColumn,
  type Rectangle,
} from "@glideapps/glide-data-grid"

import type { SQLiteViewerClient } from "../runtime/client"
import type { RelationDetails, ViewerCellValue } from "../types"
import { useViewerGridTheme } from "./grid-theme"

import "@glideapps/glide-data-grid/dist/index.css"

const PAGE_SIZE = 200
const PAGE_OVERSCAN = 1
const MAX_CACHED_PAGES = 10

interface ViewerDataGridProps {
  client: SQLiteViewerClient
  details: RelationDetails
  onError(error: unknown): void
  theme: "light" | "dark"
}

function textCell(
  data: string,
  options: { align?: "left" | "right"; faded?: boolean } = {}
): GridCell {
  return {
    allowOverlay: false,
    contentAlign: options.align,
    data,
    displayData: data,
    kind: GridCellKind.Text,
    readonly: true,
    ...(options.faded ? { themeOverride: { textDark: "#858b98" } } : {}),
  }
}

export function viewerValueToGridCell(value: ViewerCellValue): GridCell {
  switch (value.kind) {
    case "null":
      return textCell("NULL", { faded: true })
    case "integer":
      return textCell(value.value, { align: "right" })
    case "real":
      return typeof value.value === "number"
        ? {
            allowOverlay: false,
            data: value.value,
            displayData: String(value.value),
            kind: GridCellKind.Number,
            readonly: true,
          }
        : textCell(value.value, { align: "right" })
    case "text":
      return textCell(`${value.value}${value.truncated ? "…" : ""}`)
    case "blob":
      return textCell(
        `BLOB · ${value.byteLength.toLocaleString()} B · 0x${value.hexPreview}${
          value.byteLength > value.hexPreview.length / 2 ? "…" : ""
        }`
      )
    case "other":
      return textCell(value.value)
  }
}

function columnWidth(type: string): number {
  return /INT|REAL|FLOA|DOUB|NUM|DEC|BOOL/i.test(type) ? 132 : 180
}

export function ViewerDataGrid({
  client,
  details,
  onError,
  theme: themeName,
}: ViewerDataGridProps) {
  const theme = useViewerGridTheme(themeName)
  const rowsRef = useRef(new Map<number, ViewerCellValue[]>())
  const loadedPagesRef = useRef(new Set<number>())
  const loadingPagesRef = useRef(new Set<number>())
  const accessRef = useRef(new Map<number, number>())
  const clockRef = useRef(0)
  const generationRef = useRef(0)
  const [revision, setRevision] = useState(0)

  const visibleColumns = useMemo(
    () => details.columns.filter((column) => column.hidden !== 1),
    [details.columns]
  )
  const columns = useMemo<GridColumn[]>(
    () => [
      ...(details.rowidAlias
        ? [
            {
              id: "__sqlite_rowid__",
              title: details.rowidAlias,
              width: 96,
            },
          ]
        : []),
      ...visibleColumns.map((column) => ({
        id: column.name,
        title: column.name,
        width: columnWidth(column.declaredType),
      })),
    ],
    [details.rowidAlias, visibleColumns]
  )

  const loadPage = useCallback(
    async (page: number) => {
      if (
        loadedPagesRef.current.has(page) ||
        loadingPagesRef.current.has(page)
      ) {
        return
      }
      const generation = generationRef.current
      loadingPagesRef.current.add(page)
      try {
        const result = await client.getPage(
          details.relation.name,
          page * PAGE_SIZE,
          PAGE_SIZE
        )
        if (generation !== generationRef.current) return
        result.rows.forEach((row, index) => {
          rowsRef.current.set(result.offset + index, row)
        })
        loadedPagesRef.current.add(page)
        accessRef.current.set(page, ++clockRef.current)
        if (loadedPagesRef.current.size > MAX_CACHED_PAGES) {
          const oldest = [...loadedPagesRef.current]
            .filter((candidate) => candidate !== page)
            .sort(
              (left, right) =>
                (accessRef.current.get(left) ?? 0) -
                (accessRef.current.get(right) ?? 0)
            )[0]
          if (oldest !== undefined) {
            loadedPagesRef.current.delete(oldest)
            accessRef.current.delete(oldest)
            const first = oldest * PAGE_SIZE
            for (let row = first; row < first + PAGE_SIZE; row += 1) {
              rowsRef.current.delete(row)
            }
          }
        }
        setRevision((current) => current + 1)
      } catch (error) {
        if (generation === generationRef.current) onError(error)
      } finally {
        loadingPagesRef.current.delete(page)
      }
    },
    [client, details.relation.name, onError]
  )

  useEffect(() => {
    generationRef.current += 1
    rowsRef.current.clear()
    loadedPagesRef.current.clear()
    loadingPagesRef.current.clear()
    accessRef.current.clear()
    setRevision((current) => current + 1)
    if (details.rowCount > 0) void loadPage(0)
  }, [details.relation.name, details.rowCount, loadPage])

  const getCellContent = useCallback<
    NonNullable<DataEditorProps["getCellContent"]>
  >(
    ([column, row]) => {
      void revision
      const value = rowsRef.current.get(row)?.[column]
      return value
        ? viewerValueToGridCell(value)
        : { allowOverlay: false, kind: GridCellKind.Loading }
    },
    [revision]
  )

  const onVisibleRegionChanged = useCallback(
    (range: Rectangle) => {
      if (details.rowCount === 0) return
      const first = Math.max(0, Math.floor(range.y / PAGE_SIZE) - PAGE_OVERSCAN)
      const last = Math.min(
        Math.ceil(details.rowCount / PAGE_SIZE) - 1,
        Math.floor((range.y + Math.max(0, range.height - 1)) / PAGE_SIZE) +
          PAGE_OVERSCAN
      )
      for (let page = first; page <= last; page += 1) {
        accessRef.current.set(page, ++clockRef.current)
        void loadPage(page)
      }
    },
    [details.rowCount, loadPage]
  )

  if (details.rowCount === 0) {
    return (
      <div className="grid-empty" role="status">
        <strong>No rows</strong>
        <span>The schema is available in the metadata panel.</span>
      </div>
    )
  }

  return (
    <div className="viewer-grid" data-testid="viewer-grid">
      <DataEditor
        columns={columns}
        getCellContent={getCellContent}
        getCellsForSelection
        headerHeight={34}
        onPaste={false}
        onVisibleRegionChanged={onVisibleRegionChanged}
        rowHeight={34}
        rowMarkers={{ kind: "number" }}
        rows={details.rowCount}
        smoothScrollX
        smoothScrollY
        theme={theme}
        width="100%"
        height="100%"
      />
    </div>
  )
}
