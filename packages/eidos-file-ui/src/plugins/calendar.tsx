import { useCallback, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileRow,
  EidosFileRowQuery,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { CalendarDays } from "lucide-react"

import { useEidosFileUI } from "../context"
import { eidosFileInstantFromWallDate } from "../eidos-file-date-time"
import {
  EidosFileCalendarView,
  eidosFileCalendarCreateValue,
  eidosFileCalendarDateFields,
  eidosFileCalendarFieldType,
  type EidosFileCalendarRange,
} from "../eidos-file-calendar-view"
import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { eidosFileFieldKey } from "../eidos-file-field-visibility"
import { EidosFileRendererFieldPropertyPanel } from "../eidos-file-renderer-field-property-panel"
import { searchEidosFileRelationRecords } from "../eidos-file-relation-search"
import { defineEidosFilePlugin } from "../plugin"

const CALENDAR_PAGE_SIZE = 100

function localDateValue(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function eidosFileCalendarRangeFilter(
  current: EidosFileFilterGroup | null | undefined,
  field: EidosFileFieldInfo,
  range: EidosFileCalendarRange,
  timeZone?: string
): EidosFileFilterGroup {
  const dateOnly = eidosFileCalendarFieldType(field) === "date"
  const rangeStart = dateOnly
    ? undefined
    : eidosFileInstantFromWallDate(range.start, timeZone)
  const rangeEnd = dateOnly
    ? undefined
    : eidosFileInstantFromWallDate(range.end, timeZone)
  if (!dateOnly && (!rangeStart || !rangeEnd)) {
    throw new Error("The Calendar range has no unambiguous time-zone boundary")
  }
  const start = dateOnly
    ? localDateValue(range.start)
    : rangeStart!.toISOString()
  const end = dateOnly ? localDateValue(range.end) : rangeEnd!.toISOString()
  return {
    type: "group",
    conjunction: "and",
    children: [
      ...(current ? [current] : []),
      {
        type: "rule",
        field: eidosFileFieldKey(field),
        operator: "greater-than-or-equal",
        value: start,
      },
      {
        type: "rule",
        field: eidosFileFieldKey(field),
        operator: "less-than",
        value: end,
      },
    ],
  }
}

function EidosFileCalendarRenderer(props: EidosFileViewRendererProps) {
  const { timeZone } = useEidosFileUI()
  const {
    source,
    table,
    view,
    query,
    disabled,
    reloadToken,
    onMutation,
    onDeleteRow,
    onError,
  } = props
  const labelField = table.fields.find((field) => field.isRecordLabel)
  const loadRows = useCallback(
    async (field: EidosFileFieldInfo, range: EidosFileCalendarRange) => {
      const scopedQuery: EidosFileRowQuery = {
        ...query,
        filter: eidosFileCalendarRangeFilter(
          query.filter,
          field,
          range,
          timeZone
        ),
      }
      const projection = {
        columns: [
          eidosFileFieldKey(field),
          ...(labelField ? [eidosFileFieldKey(labelField)] : []),
        ],
        includeRecordLabel: true,
      }
      const rows: EidosFileRow[] = []
      let offset = 0
      let cursor: string | undefined
      let totalHint: number | undefined
      while (totalHint === undefined || rows.length < totalHint) {
        const page = await source.getPage(
          table.table.id,
          offset,
          CALENDAR_PAGE_SIZE,
          scopedQuery,
          totalHint,
          cursor,
          projection
        )
        rows.push(...page.rows)
        totalHint = page.total
        if (page.rows.length === 0 || rows.length >= page.total) break
        offset += page.rows.length
        cursor = page.nextCursor
      }
      return rows
    },
    [labelField, query, source, table.table.id, timeZone]
  )
  const editCell = useCallback(
    async (
      row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => {
      const result = await source.updateRow(table.table.id, String(row._id), {
        [eidosFileFieldKey(field)]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )
  const addRow = useCallback(
    async (field: EidosFileFieldInfo, day: Date) => {
      const value = eidosFileCalendarCreateValue(field, day, timeZone)
      const result = await source.insertRow(table.table.id, {
        ...(value === undefined ? {} : { [eidosFileFieldKey(field)]: value }),
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id, timeZone]
  )
  const searchRelation = useCallback(
    (field: EidosFileFieldInfo, relationQuery: string) =>
      searchEidosFileRelationRecords(source, field, relationQuery),
    [source]
  )
  const loadRow = useMemo(
    () =>
      source.getRow
        ? (rowId: string) => source.getRow!(table.table.id, rowId)
        : undefined,
    [source, table.table.id]
  )

  if (!view) return null
  return (
    <EidosFileCalendarView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      loadRows={loadRows}
      loadRow={loadRow}
      onCellEdit={editCell}
      onAddRow={addRow}
      onDeleteRow={onDeleteRow}
      onImportFiles={props.onImportFiles}
      onImportDroppedFiles={props.onImportDroppedFiles}
      onSearchRelation={searchRelation}
      onRowCountChange={props.onSearchResultCountChange}
      onError={onError}
      sidePanel={
        props.propertyField ? (
          <EidosFileRendererFieldPropertyPanel
            source={source}
            table={table}
            tables={props.tables}
            field={props.propertyField}
            disabled={disabled}
            onSnapshot={props.onSnapshot}
            onClose={props.onFieldClose}
            onEditFormula={props.onEditFormula}
            onEditLookup={props.onEditLookup}
            onError={onError}
          />
        ) : undefined
      }
    />
  )
}

export const eidosFileCalendarPlugin = defineEidosFilePlugin({
  id: "@eidos.space/eidos-file-ui/calendar",
  views: [
    {
      type: "calendar",
      label: "Calendar",
      description: "Records arranged by date",
      icon: CalendarDays,
      renderer: EidosFileCalendarRenderer,
      create: {
        defaultName: "Calendar",
        isAvailable: (fields) => eidosFileCalendarDateFields(fields).length > 0,
        properties: (fields) => {
          const dateField = eidosFileCalendarDateFields(fields)[0]
          return dateField
            ? { dateField: eidosFileFieldKey(dateField) }
            : undefined
        },
      },
    },
  ],
})
