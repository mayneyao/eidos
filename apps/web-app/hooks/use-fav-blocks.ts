import { useCallback } from "react"
import { useTabsKV, type FavBlock } from "./use-tabs-kv"

export const useFavBlocks = () => {
  const {
    tabs,
    addTab,
    removeTab,
    resetTabs,
  } = useTabsKV()

  const addFavBlock = useCallback(
    (block: Omit<FavBlock, "space">) => {
      return addTab(block.id)
    },
    [addTab]
  )

  const removeFavBlock = useCallback(
    (blockId: string) => {
      removeTab(blockId)
    },
    [removeTab]
  )

  const isFavorite = useCallback(
    (blockId: string) => {
      return tabs.includes(blockId)
    },
    [tabs]
  )

  const toggleFavBlock = useCallback(
    (block: Omit<FavBlock, "space">) => {
      if (isFavorite(block.id)) {
        removeFavBlock(block.id)
        return false // Removed
      } else {
        return addFavBlock(block) // Returns true if added, false if already exists
      }
    },
    [isFavorite, removeFavBlock, addFavBlock]
  )



  return {
    tabs,
    addFavBlock,
    removeFavBlock,
    isFavorite,
    toggleFavBlock,
    resetTabs,
  }
}