export enum TreeNodeType {
  Table = "table",
  Doc = "doc",
  Folder = "folder",
  Dataview = "dataview",
  Link = "link",
}

export interface ITreeNode {
  id: string
  name: string
  type:
    | TreeNodeType
    | `ext__${string}`
    | "day"
    | "table"
    | "doc"
    | "folder"
    | "dataview"
    | "link"
    | "extension"
  position?: number
  parent_id?: string
  is_pinned?: boolean
  is_full_width?: boolean
  is_locked?: boolean
  is_deleted?: boolean
  hide_properties?: boolean
  icon?: string
  cover?: string
  /**
   * ref: stores the link target.
   * For external links: a URL string (e.g. "https://example.com")
   * For internal nodes: an eidos node ID (e.g. "abc123")
   */
  ref?: string
  created_at?: string
  updated_at?: string
}
