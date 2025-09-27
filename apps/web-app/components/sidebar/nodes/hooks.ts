import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useNode } from "@/apps/web-app/hooks/use-nodes"

import { useFolderStore } from "./store"

export const useTreeOperations = () => {
  const { updateParentId } = useNode()
  const { currentCut, setCut } = useFolderStore()
  const handlePaste = (node?: ITreeNode) => {
    if (!node) {
      updateParentId(currentCut!, undefined)
    } else if (node.type === "folder") {
      updateParentId(currentCut!, node.id)
    }
    setCut(null)
  }
  const handleCut = (targetId: string) => {
    if (currentCut === targetId) {
      setCut(null)
    } else {
      setCut(targetId)
    }
  }

  return {
    handlePaste,
    handleCut,
  }
}
