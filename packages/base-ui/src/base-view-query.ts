import type {
  BaseFilterGroup,
  BaseRowQuery,
  BaseViewInfo,
} from "@eidos.space/base"

/** Builds the runtime query represented by a saved view and transient search. */
export function baseViewRowQuery(
  view: BaseViewInfo | undefined,
  search = ""
): BaseRowQuery {
  const normalizedSearch = search.trim()
  return {
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    ...(view?.filter ? { filter: view.filter } : {}),
    ...(view?.sorts.length ? { sorts: view.sorts } : {}),
  }
}

/** Adds a Kanban group constraint without changing the saved view filter. */
export function baseViewGroupFilter(
  current: BaseFilterGroup | null | undefined,
  groupField: string,
  value: string | null
): BaseFilterGroup {
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
