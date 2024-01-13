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
}

export interface IGridViewProperties {
  fieldWidthMap: Record<string, number>
}
