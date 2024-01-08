export interface ITreeNode {
  id: string
  name: string
  type: "table" | "doc"
  parentId?: string
  // is pin to top
  isPinned?: boolean
  icon?: string
  cover?: string
}
