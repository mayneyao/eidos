export enum TreeNodeType {
  Table = "table",
  Doc = "doc",
  Folder = "folder",
  Dataview = "dataview",
}

export interface ITreeNode {
  id: string
  name: string
  type: TreeNodeType | `ext__${string}` | 'day' | 'table' | 'doc' | 'folder' | 'dataview' | 'extension'
  position?: number
  parent_id?: string
  is_pinned?: boolean
  is_full_width?: boolean
  is_locked?: boolean
  is_deleted?: boolean
  hide_properties?: boolean
  icon?: string
  cover?: string
  created_at?: string
  updated_at?: string
}
