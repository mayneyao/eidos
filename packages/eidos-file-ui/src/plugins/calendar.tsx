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
  type EidosFileCalendarLayout,
  type EidosFileCalendarPageRequest,
  type EidosFileCalendarRange,
} from "../eidos-file-calendar-view"
import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { eidosFileFieldKey } from "../eidos-file-field-visibility"
import { EidosFileRendererFieldPropertyPanel } from "../eidos-file-renderer-field-property-panel"
import { searchEidosFileRelationRecords } from "../eidos-file-relation-search"
import { defineEidosFilePlugin } from "../plugin"

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
    async (
      field: EidosFileFieldInfo,
      range: EidosFileCalendarRange,
      request: EidosFileCalendarPageRequest
    ) => {
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
      const page = await source.getPage(
        table.table.id,
        0,
        request.limit,
        scopedQuery,
        request.totalHint,
        request.cursor,
        projection
      )
      return {
        rows: page.rows,
        total: page.total,
        nextCursor: page.nextCursor ?? null,
      }
    },
    [labelField, query, source, table.table.id, timeZone]
  )
  const loadDayTotals = useCallback(
    async (field: EidosFileFieldInfo, range: EidosFileCalendarRange) => {
      if (
        eidosFileCalendarFieldType(field) !== "date" ||
        field.valueKind !== "source" ||
        field.isDerived ||
        !source.getGroupCounts
      ) {
        return null
      }
      const groups = await source.getGroupCounts(
        table.table.id,
        eidosFileFieldKey(field),
        {
          ...query,
          filter: eidosFileCalendarRangeFilter(
            query.filter,
            field,
            range,
            timeZone
          ),
        }
      )
      return new Map(
        groups.flatMap((group) =>
          typeof group.value === "string"
            ? [[group.value, group.total] as const]
            : []
        )
      )
    },
    [query, source, table.table.id, timeZone]
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
  const changeLayout = useCallback(
    async (calendarLayout: EidosFileCalendarLayout) => {
      if (!view) return
      const snapshot = await source.updateView(view.id, {
        properties: {
          ...(view.properties ?? {}),
          calendarLayout,
        },
      })
      props.onSnapshot?.(snapshot)
    },
    [props.onSnapshot, source, view]
  )

  if (!view) return null
  return (
    <EidosFileCalendarView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      loadRows={loadRows}
      loadDayTotals={loadDayTotals}
      loadRow={loadRow}
      onCellEdit={editCell}
      onAddRow={addRow}
      onDeleteRow={onDeleteRow}
      onImportFiles={props.onImportFiles}
      onImportDroppedFiles={props.onImportDroppedFiles}
      onSearchRelation={searchRelation}
      onLayoutChange={changeLayout}
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
            ? {
                dateField: eidosFileFieldKey(dateField),
                calendarLayout: "month",
              }
            : undefined
        },
      },
    },
  ],
})
