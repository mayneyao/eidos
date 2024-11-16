import { forwardRef, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { getBlockIdFromUrl } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useMblock } from "@/hooks/use-mblock"

import { BlockRenderer, type BlockRendererRef } from "./block-renderer"

export const BlockApp = forwardRef<BlockRendererRef, { url: string }>(
  ({ url }, ref) => {
    const { t } = useTranslation()
    const { space } = useCurrentPathInfo()
    const { blockId, props, blockSpace } = useMemo(() => {
      const _url = new URL(url)
      const [id, blockSpace] = getBlockIdFromUrl(url).split("@")
      return {
        blockId: id,
        props: Object.fromEntries(_url.searchParams.entries()),
        blockSpace,
      }
    }, [url])

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
        ref={ref}
        code={block?.ts_code ?? ""}
        compiledCode={block?.code ?? ""}
        env={block?.env_map}
        bindings={block?.bindings}
        defaultProps={props}
      />
    )
  }
)

BlockApp.displayName = "BlockApp"
