export interface ITreeNode {
  id: string
  name: string
  type: "table" | "doc"
  parent_id?: string
  // is pin to top
  is_pinned?: boolean
  is_deleted?: boolean
  icon?: string
  cover?: string
  created_at?: string
  updated_at?: string
}
