import { forwardRef } from "react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"

import { type BlockRendererRef } from "./block-renderer"
import { WebViewBlock } from "./webview-block"

export const ExtTableViewBlockApp = forwardRef<
  BlockRendererRef,
  {
    space: string
    blockId: string | null
    tableId: string
    viewId: string
  }
>(({ space, blockId, tableId, viewId }, ref) => {
  const { t } = useTranslation()
  const block = useMblock(blockId || undefined)

  if (!blockId) {
    // Table view extension needs an enabled handle block to work
    return (
      <div className="flex justify-center items-center h-full w-full">
        <div className="text-sm text-gray-500">
          {t(
            "common.tips.extTableViewNeedHandleBlock",
            "Table view extension needs an enabled handle block to work"
          )}
        </div>
      </div>
    )
  }

  if (!block) {
    return (
      <div className="flex justify-center items-center h-full w-full">
        <div className="text-sm text-gray-500">
          {t("common.tips.notFoundBlock", "Block not found")}
        </div>
      </div>
    )
  }

  if (!isDesktopMode) {
    return (
      <div className="flex justify-center items-center h-full w-full">
        <div className="text-sm text-gray-500">
          {t(
            "common.tips.extTableViewOnlyWorksOnDesktop",
            "Table view extensions only work on desktop"
          )}
        </div>
      </div>
    )
  }

  if (isDesktopMode) {
    // For table view extensions, the URL structure should be:
    // <extid>.block.<spaceId>.eidos.localhost:13127/<tableid>/<viewid>
    const extraPath = `${tableId}/${viewId}`

    return (
      <WebViewBlock
        blockId={blockId}
        width="100%"
        height="100%"
        extraPath={extraPath}
        defaultProps={{}}
        rerenderOnDefaultPropsChange
      />
    )
  }

  return null
})

ExtTableViewBlockApp.displayName = "ExtTableViewBlockApp"
