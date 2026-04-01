import type { FilterValueType } from "./IViewFilter"
import type { ViewColumnStatsConfig } from "./IColumnStats"

export enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
  DocList = "doc_list",
  Kanban = "kanban",
}

export type ViewType = ViewTypeEnum | `${ViewTypeEnum}` | `ext__${string}`

export interface IView<T = any> {
  id: string
  name: string
  type: ViewTypeEnum | `${ViewTypeEnum}` | `ext__${string}`
  table_id: string // tableId uuid
  query: string
  fieldIds?: string[]
  properties?: T
  filter?: FilterValueType
  order_map?: Record<string, number>
  hidden_fields?: string[]
  position?: number
}

export interface IGridViewProperties {
  fieldWidthMap: Record<string, number>
  freezeColumns?: number
  /** Column stats config */
  columnStats?: ViewColumnStatsConfig
}
