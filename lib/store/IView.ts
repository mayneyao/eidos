import { FilterValueType } from "@/components/table/view-filter-editor/interface"

export enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
}

export interface IView<T = any> {
  id: string
  name: string
  type: ViewTypeEnum
  tableId: string // tableId uuid
  query: string
  fieldIds?: string[]
  properties?: T
  filter?: FilterValueType
  orderMap?: Record<string, number>
  hiddenFields?: string[]
}

export interface IGridViewProperties {
  fieldWidthMap: Record<string, number>
}
