import { useMemo } from "react"

import { AllNodes } from "../nodes"
import { ExtBlock, useEnabledExtBlocks, useExtBlocks } from "./use-ext-blocks"

export const useAllEditorNodes = () => {
  const extBlocks = useExtBlocks()
  return useMemo(
    () => [...AllNodes, ...extBlocks.map((block) => block.node)],
    [extBlocks]
  )
}

export const useLoadingExtBlocks = () => {
  const { scripts: allEnabledExtBlocks, loading } = useEnabledExtBlocks()
  const extBlocks = ((window as any).__DOC_EXT_BLOCKS as ExtBlock[]) || []
  return loading || allEnabledExtBlocks.length !== extBlocks.length
}
