import { isEidosFileUuid } from "@eidos.space/eidos-file"

interface NavigableSnapshot {
  metadata: { defaultTableId?: string | null }
  tables: ReadonlyArray<{
    table: { id: string }
    views: ReadonlyArray<{ id: string; type: string }>
  }>
}

export interface ServeNavigationParameters {
  tableId: string | null
  viewId: string | null
}

export interface ServeNavigationTarget {
  tableId: string | null
  viewId: string | null
}

export function resolveServeView<T extends { id: string }>(
  views: ReadonlyArray<T>,
  requestedViewId?: string | null
): T | undefined {
  return views.find((view) => view.id === requestedViewId) ?? views[0]
}

export function parseServeNavigationParameters(
  search: string
): ServeNavigationParameters {
  const parameters = new URLSearchParams(search)
  return {
    tableId: uniqueEidosId(parameters, "table"),
    viewId: uniqueEidosId(parameters, "view"),
  }
}

export function resolveServeNavigation(
  snapshot: NavigableSnapshot,
  search: string
): ServeNavigationTarget {
  const requested = parseServeNavigationParameters(search)
  const defaultTable =
    snapshot.tables.find(
      (candidate) => candidate.table.id === snapshot.metadata.defaultTableId
    ) ??
    snapshot.tables[0] ??
    null
  const requestedTable = snapshot.tables.find(
    (candidate) => candidate.table.id === requested.tableId
  )
  const viewTable =
    requested.viewId === null
      ? undefined
      : snapshot.tables.find((candidate) =>
          candidate.views.some((view) => view.id === requested.viewId)
        )
  const table = requestedTable ?? viewTable ?? defaultTable
  if (table === null) return { tableId: null, viewId: null }

  const view = resolveServeView(table.views, requested.viewId)
  return { tableId: table.table.id, viewId: view?.id ?? null }
}

function uniqueEidosId(
  parameters: URLSearchParams,
  name: string
): string | null {
  const values = parameters.getAll(name)
  return values.length === 1 && isEidosFileUuid(values[0]) ? values[0] : null
}
