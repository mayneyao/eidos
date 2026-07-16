import { uuidv7 } from "@/lib/utils"
import { filePathFromSpaceUrl } from "@/apps/web-app/components/file-space/file-path"
import { flushCurrentSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { resourceContextFromTabUrl } from "./resource-context"

export async function openFileSpaceAgent(
  options: { openInRightPanel?: boolean; spaceId?: string } = {}
): Promise<string | null> {
  const store = useTabStore.getState()
  const sourceTabId = store.getActiveTabId()
  const sourceTab = store.tabs.find((tab) => tab.id === sourceTabId)
  const sourcePath = sourceTab ? filePathFromSpaceUrl(sourceTab.url) : null
  if (
    sourcePath &&
    !(await flushCurrentSpaceFile(options.spaceId, sourcePath))
  ) {
    window.alert(
      "Eidos could not save the current file. Resolve the error before opening Agent."
    )
    return null
  }
  const conversationId = uuidv7()
  const context = sourceTab ? resourceContextFromTabUrl(sourceTab.url) : null
  store.openTab(`/agent/${conversationId}`, "Agent", {
    forceNewTab: true,
    openInRightPanel: options.openInRightPanel,
    state: {
      __isInternalTabNavigation: true,
      sourceTabId,
      sourceUrl: sourceTab?.url,
      selection: context?.selection,
    },
  })
  return conversationId
}
