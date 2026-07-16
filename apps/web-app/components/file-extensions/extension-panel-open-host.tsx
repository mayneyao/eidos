import { useEffect } from "react"

import type { FileExtensionPanelOpenEvent } from "@/apps/desktop/electron/modules/file-extensions/types"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabStore } from "@/apps/web-app/store/tabs"

export function ExtensionPanelOpenHost() {
  const { currentSpace } = useCurrentSpace()

  useEffect(() => {
    if (!window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:open-panel",
      (_event: unknown, payload: unknown) => {
        const request = payload as Partial<FileExtensionPanelOpenEvent>
        if (
          request.spaceId !== currentSpace?.id ||
          typeof request.sessionId !== "string" ||
          typeof request.title !== "string"
        ) {
          return
        }
        const url = `/extension-panel?session=${encodeURIComponent(request.sessionId)}`
        useTabStore.getState().openTab(url, request.title)
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:open-panel", listenerId)
      }
    }
  }, [currentSpace?.id])

  return null
}
