export enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
}

export interface IView {
  id: string
  name: string
  type: ViewTypeEnum
  tableId: string // tableId uuid
  query: string
  fieldIds?: string[]
}
