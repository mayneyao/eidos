import type { ITreeNode } from "@/packages/core/types/ITreeNode"

export type PropertyType = "text" | "number" | "date" | "datetime" | "boolean" | "tags"

export interface DocPropertyGlobalProps {
  docId: string
  parentNode?: ITreeNode | null
}
