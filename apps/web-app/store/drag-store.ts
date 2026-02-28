import { create } from "zustand"
import type { FileTreeNode } from "@/apps/web-app/components/file-tree"

interface DragState {
  isDragging: boolean
  draggedNode: FileTreeNode | null
  setDragging: (isDragging: boolean, node?: FileTreeNode) => void
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  draggedNode: null,
  setDragging: (isDragging: boolean, node?: FileTreeNode) =>
    set({
      isDragging,
      draggedNode: isDragging ? node : null,
    }),
}))
