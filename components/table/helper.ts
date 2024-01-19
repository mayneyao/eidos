import { orderBy } from "lodash"

import { IField } from "@/lib/store/interface"

export const getShowColumns = (
  uiColumns: IField[],
  options: {
    orderMap?: Record<string, number>
    hiddenFields?: string[]
  }
): IField[] => {
  const { hiddenFields, orderMap } = options

  const sortedUiColumns = orderBy(
    uiColumns,
    (column) => orderMap?.[column.table_column_name] ?? 0
  )
  const hiddenFieldsSet = new Set(hiddenFields ?? [])
  if (hiddenFieldsSet.size) {
    return sortedUiColumns.filter(
      (column) => !hiddenFieldsSet.has(column.table_column_name)
    )
  }
  return sortedUiColumns
}
