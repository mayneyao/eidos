"use client"

import { useEffect, useMemo, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"
import {
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"

const STATUS_ORDER = ["Backlog", "Active", "Done"] as const

function rowId(row: EidosFileRow): string {
  return String(row._id)
}

function dueDate(row: EidosFileRow): string {
  return typeof row.due === "string" ? row.due : "Unscheduled"
}

function TimelineRenderer({
  source,
  table,
  query,
  reloadToken,
  disabled,
  selection,
  onSelectionChange,
  onMutation,
  onError,
}: EidosFileViewRendererProps) {
  const [rows, setRows] = useState<EidosFileRow[]>([])
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    source
      .getPage(table.table.id, 0, 24, query)
      .then((page) => {
        if (active) setRows(page.rows)
      })
      .catch(onError)
    return () => {
      active = false
    }
  }, [onError, query, reloadToken, source, table.table.id])

  const lanes = useMemo(() => {
    const groups = new Map<string, EidosFileRow[]>()
    for (const row of rows) {
      const month = dueDate(row).slice(0, 7)
      groups.set(month, [...(groups.get(month) ?? []), row])
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  }, [rows])

  async function advance(row: EidosFileRow) {
    const id = rowId(row)
    const current = String(row.status ?? "Backlog")
    const currentIndex = STATUS_ORDER.indexOf(
      current as (typeof STATUS_ORDER)[number]
    )
    const next =
      STATUS_ORDER[Math.min(currentIndex + 1, STATUS_ORDER.length - 1)]
    setPending(id)
    try {
      const result = await source.updateRow(table.table.id, id, {
        status: next,
      })
      setRows((currentRows) =>
        currentRows.map((item) =>
          rowId(item) === id ? { ...item, status: next } : item
        )
      )
      onMutation?.(result)
    } catch (error) {
      onError?.(error)
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="timeline" aria-label={`${table.table.name} timeline`}>
      {lanes.map(([month, monthRows]) => (
        <div className="timeline-lane" key={month}>
          <div className="timeline-month">
            <strong>{month}</strong>
            <span>{monthRows.length} records</span>
          </div>
          <div className="timeline-records">
            {monthRows.map((row) => {
              const id = rowId(row)
              const selected = selection.rowIds.includes(id)
              return (
                <article
                  className="timeline-record"
                  data-selected={selected || undefined}
                  key={id}
                >
                  <button
                    className="record-select"
                    type="button"
                    onClick={() => onSelectionChange?.({ rowIds: [id] })}
                  >
                    <span>{String(row.title ?? "Untitled")}</span>
                    <small>{dueDate(row)}</small>
                  </button>
                  <button
                    className="status-button"
                    type="button"
                    disabled={
                      disabled || pending === id || row.status === "Done"
                    }
                    onClick={() => void advance(row)}
                  >
                    {pending === id
                      ? "Saving…"
                      : String(row.status ?? "Backlog")}
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

export const timelineView = defineEidosFileView({
  type: "timeline",
  label: "Timeline",
  description: "Group dated records into a compact delivery timeline.",
  renderer: TimelineRenderer,
  create: {
    defaultName: "Timeline",
    isAvailable: (fields) => fields.some((field) => field.type === "date"),
    properties: () => ({ dateField: "due" }),
  },
})
