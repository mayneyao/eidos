import { forwardRef, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { getBlockIdFromUrl } from "@/lib/utils"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"

import { BlockRenderer, type BlockRendererRef } from "./block-renderer"

export const BlockApp = forwardRef<
  BlockRendererRef,
  {
    url: string
    height?: number | string
    width?: number | string
    rerenderOnDefaultPropsChange?: boolean
  }
>(({ url, height, width, rerenderOnDefaultPropsChange }, ref) => {
  const currentNode = useCurrentNode()
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { blockId, props, blockSpace } = useMemo(() => {
    const _url = new URL(url)
    const [id, blockSpace] = getBlockIdFromUrl(url).split("@")
    const context = {
      currentNode,
    }
    const props = Object.fromEntries(_url.searchParams.entries()) as Record<
      string,
      any
    >
    props["__context__"] = context
    return {
      blockId: id,
      props: props,
      blockSpace,
    }
  }, [url, currentNode])

  const block = useMblock(blockId)
  if (blockSpace && blockSpace !== space) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-sm text-gray-500">
          {t("common.tips.blockNotInCurrentSpace", {
            space: blockSpace,
          })}
        </div>
      </div>
    )
  }
  if (!block) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-sm text-gray-500">
          {t("common.tips.notFoundBlock")}
        </div>
      </div>
    )
  }

  return (
    <BlockRenderer
      blockId={block.id}
      ref={ref}
      code={block?.ts_code ?? ""}
      compiledCode={block?.code ?? ""}
      // TODO: fix this
      // env={block?.env_map}
      bindings={block?.bindings}
      defaultProps={props}
      rerenderOnDefaultPropsChange={rerenderOnDefaultPropsChange}
      height={height}
      width={width}
    />
  )
})

BlockApp.displayName = "BlockApp"
