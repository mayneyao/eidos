import { FilterValueType } from "@/components/table/view-filter-editor/interface"

export enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
  DocList = "doc_list",
}

export interface IView<T = any> {
  id: string
  name: string
  type: ViewTypeEnum
  table_id: string // tableId uuid
  query: string
  fieldIds?: string[]
  properties?: T
  filter?: FilterValueType
  order_map?: Record<string, number>
  hidden_fields?: string[]
}

export interface IGridViewProperties {
  fieldWidthMap: Record<string, number>
}
