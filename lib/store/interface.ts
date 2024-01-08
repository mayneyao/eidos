import { FieldType } from "@/lib/fields/const"

import { ITreeNode } from "./ITreeNode"
import { IView } from "./IView"

export type IField<T = any> = {
  name: string
  type: FieldType
  table_column_name: string
  table_name: string
  property: T
}

export interface ITable {
  rowMap: {
    [rowId: string]: Record<string, any>
  }
  rowIds: string[]
  rowCount: number
  fieldMap: {
    [fieldId: string]: IField
  }
  viewMap: {
    [viewId: string]: IView
  }
  viewIds: string[]
}

export interface IDataStore {
  tableMap: {
    [nodeId: string]: ITable
  }
  nodeIds: string[]
  nodeMap: {
    [nodeId: string]: ITreeNode
  }
}
