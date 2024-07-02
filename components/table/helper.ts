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

export const TABLE_CONTENT_ELEMENT_ID = "table-content-area"

const ONE_K = 1000

export enum DataLevel {
  L1 = ONE_K * 10, // 0 - 10,000
  L2 = ONE_K * 100, // 10,000 - 100,000
  L3 = ONE_K * 1000, // 100,000 - 1,000,000
}

export const getDataLevel = (count: number) => {
  if (count < DataLevel.L1) {
    return DataLevel.L1
  } else if (count < DataLevel.L2) {
    return DataLevel.L2
  }
  return DataLevel.L3
}
