export interface ITreeNode {
  id: string
  name: string
  type: "table" | "doc" | "folder" | string
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
