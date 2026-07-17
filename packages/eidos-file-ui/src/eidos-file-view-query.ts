import type {
  EidosFileFilterGroup,
  EidosFileRowQuery,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

/** Builds the runtime query represented by a saved view and transient search. */
export function eidosFileViewRowQuery(
  view: EidosFileViewInfo | undefined,
  search = ""
): EidosFileRowQuery {
  const normalizedSearch = search.trim()
  return {
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    ...(view?.filter ? { filter: view.filter } : {}),
    ...(view?.sorts.length ? { sorts: view.sorts } : {}),
  }
}

/** Adds a Kanban group constraint without changing the saved view filter. */
export function eidosFileViewGroupFilter(
  current: EidosFileFilterGroup | null | undefined,
  groupField: string,
  value: string | null
): EidosFileFilterGroup {
  const groupRule = {
    type: "rule" as const,
    field: groupField,
    operator: value === null ? ("is-empty" as const) : ("equals" as const),
    ...(value === null ? {} : { value }),
  }
  return {
    type: "group",
    conjunction: "and",
    children: current ? [current, groupRule] : [groupRule],
  }
}
