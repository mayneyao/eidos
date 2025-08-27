
import type { ITreeNode } from "../../../packages/core/types/ITreeNode"
import type { IView } from "../../../packages/core/types/IView"
import type { IField } from "@/packages/core/types/IField"

export interface ITable {
  rowMap: {
    [rowId: string]: Record<string, any>
  }
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
