import { useMemo } from "react"

import { getAllNodes } from "../nodes"
import { ExtBlock, useEnabledExtBlocks, useExtBlocks } from "./use-ext-blocks"
import { BuiltInBlocks } from "../blocks"

export const useAllEditorNodes = () => {
  const extBlocks = useExtBlocks()
  return useMemo(
    () => [...getAllNodes(), ...extBlocks.map((block) => block.node), ...BuiltInBlocks.map((block) => block.node)],
    [extBlocks]
  )
}

export const useLoadingExtBlocks = () => {
  const { scripts: allEnabledExtBlocks, loading } = useEnabledExtBlocks()
  const extBlocks = ((window as any).__DOC_EXT_BLOCKS as ExtBlock[]) || []
  return loading || allEnabledExtBlocks.length !== extBlocks.length
}
