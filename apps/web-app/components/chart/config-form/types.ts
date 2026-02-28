export type DataSourceType = "raw" | "table" | "script"

export type DataRawConfig = {
  type: "raw"
}

export type DataTableConfig = {
  type: "table"
  tableId: string
  viewId?: string
  transforms?: any[]
  selectedFields?: string[]
}

export type DataScriptConfig = {
  type: "script"
  scriptId: string
}

export type DataSourceConfig =
  | DataRawConfig
  | DataTableConfig
  | DataScriptConfig

export interface DataTransform {
  type: "filter" | "sort" | "aggregate"
  config: {
    filterColumn?: string
    filterValue?: string
    sortColumn?: string
    sortDirection?: "asc" | "desc"
    aggregateColumn?: string
    aggregateFunction?: "sum" | "avg" | "count"
    groupByColumn?: string
  }
}
