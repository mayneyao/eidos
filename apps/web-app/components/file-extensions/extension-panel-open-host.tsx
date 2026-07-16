import { useEffect } from "react"

import type { FileExtensionPanelOpenEvent } from "@/apps/desktop/electron/modules/file-extensions/types"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { type Tab, useTabStore } from "@/apps/web-app/store/tabs"

function panelSessionIds(tabs: readonly Pick<Tab, "url">[]): Set<string> {
  return new Set(
    tabs.flatMap((tab) => {
      try {
        const url = new URL(tab.url, "https://eidos.local")
        const sessionId = url.searchParams.get("session")
        return url.pathname === "/extension-panel" && sessionId
          ? [sessionId]
          : []
      } catch {
        return []
      }
    })
  )
}

export function ExtensionPanelOpenHost() {
  const { currentSpace } = useCurrentSpace()

  useEffect(() => {
    const spaceId = currentSpace?.id
    const eidos = window.eidos
    if (!spaceId || !eidos) return
    const listenerId = eidos.on(
      "file-extensions:open-panel",
      (_event: unknown, payload: unknown) => {
        const request = payload as Partial<FileExtensionPanelOpenEvent>
        if (
          request.spaceId !== spaceId ||
          typeof request.sessionId !== "string" ||
          typeof request.title !== "string"
        ) {
          return
        }
        const url = `/extension-panel?session=${encodeURIComponent(request.sessionId)}`
        useTabStore.getState().openTab(url, request.title)
      }
    )
    const unsubscribe = useTabStore.subscribe((state, previousState) => {
      const currentSessions = panelSessionIds(state.tabs)
      for (const sessionId of panelSessionIds(previousState.tabs)) {
        if (currentSessions.has(sessionId)) continue
        void eidos.fileExtensions
          .closePanelSession(spaceId, { sessionId })
          .catch(() => undefined)
      }
    })
    return () => {
      unsubscribe()
      if (listenerId) {
        eidos.off("file-extensions:open-panel", listenerId)
      }
    }
  }, [currentSpace?.id])

  return null
}
