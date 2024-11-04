import { useMemo } from "react"

import { getBlockIdFromUrl } from "@/lib/utils"
import { useMblock } from "@/hooks/use-mblock"

import { BlockRenderer } from "./block-renderer"

export const BlockApp = ({ url }: { url: string }) => {
  const { blockId, props } = useMemo(() => {
    const _url = new URL(url)
    return {
      blockId: getBlockIdFromUrl(url),
      props: Object.fromEntries(_url.searchParams.entries()),
    }
  }, [url])

  const block = useMblock(blockId)

  return (
    <BlockRenderer
      code={block?.ts_code ?? ""}
      compiledCode={block?.code ?? ""}
      env={block?.env_map}
      defaultProps={props}
    />
  )
}
