import { useCurrentUser } from "@/apps/web-app/hooks/user-current-user"
import { EidosProtocolUrlChannelName } from "@/lib/const"
import { isDesktopMode } from "@/lib/env"
import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { getToday, uuidv7 } from "@/lib/utils"
import { useCallback, useEffect, useRef } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useExtensionInstaller } from "./useExtensionInstaller"

export const useProtocolUrl = () => {
  const { navigate } = useRouterAdapter()
  const { id: userId } = useCurrentUser()
  const listenerRef = useRef<any>()
  const { installExtension } = useExtensionInstaller()

  const createDocWithMarkdown = useCallback(
    async (props: {
      spaceId: string
      docId: string
      markdown: string
      title?: string
      mode?: "replace" | "append" | "prepend"
    }) => {
      const { spaceId, docId, markdown, title, mode } = props
      const sqlite = getSqliteProxy(spaceId, userId || "")
      console.log("Start creating doc:", new Date().toISOString())
      await sqlite?.createOrUpdateDocWithMarkdown(
        docId,
        markdown,
        undefined,
        title,
        mode
      )

      let attempts = 0
      const maxAttempts = 10
      while (attempts < maxAttempts) {
        console.log(
          "Polling attempt",
          attempts + 1,
          "at:",
          new Date().toISOString()
        )
        const doc = await sqlite?.getDoc(docId)
        if (doc) {
          console.log("Document found at:", new Date().toISOString())
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
        attempts++
      }

      console.log("Navigating at:", new Date().toISOString())
    },
    [navigate, userId]
  )

  const handleProtocolUrl = useCallback(
    async (event: any, data: any) => {
      console.log("handleProtocolUrl called at:", new Date().toISOString(), {
        event,
        data,
        stack: new Error().stack,
      })
      const { action, searchParams } = data
      let content = searchParams["content"] || ""
      if ("clipboard" in searchParams) {
        content = await navigator.clipboard.readText()
      }
      switch (action) {
        case "open":
          if ("space" in searchParams) {
            const spaceId = searchParams["space"]
          }
          break

        case "open-space":
          // Handle eidos open command from CLI (like "code .")
          if ("space" in searchParams) {
            const spaceId = searchParams["space"]
            console.log(`Opening space from CLI: ${spaceId}`)

            // In desktop mode, use Electron IPC to switch space
            if (
              isDesktopMode &&
              typeof window !== "undefined" &&
              window.eidos
            ) {
              try {
                await window.eidos.spaceMgmt.switchSpace(spaceId)
                console.log(`✓ Successfully switched to space: ${spaceId}`)
                // Electron will automatically reload to new subdomain
              } catch (error) {
                console.error("Error switching space:", error)
              }
            } else {
              // Fallback for web mode (though this command is mainly for desktop)
              navigate(`/${spaceId}`)
            }
          }
          break

        case "search":
          if ("space" in searchParams) {
            const spaceId = searchParams["space"]
          }
          break

        case "new":
          if ("space" in searchParams) {
            const spaceId = searchParams["space"]
            let title = searchParams["file"] || searchParams["title"] || ""
            console.log({ spaceId, content, title })
            const docId = uuidv7().replace(/-/g, "")
            await createDocWithMarkdown({
              spaceId,
              docId,
              markdown: content,
              title,
              mode: "replace",
            })
            navigate(`/${docId}`)
          }
          break

        case "daily":
          const spaceId = searchParams["space"]
          const date = getToday()
          const docId = date

          if ("append" in searchParams) {
            await createDocWithMarkdown({
              spaceId,
              docId,
              markdown: content,
              title: undefined,
              mode: "append",
            })
          } else if ("prepend" in searchParams) {
            await createDocWithMarkdown({
              spaceId,
              docId,
              markdown: content,
              title: undefined,
              mode: "prepend",
            })
          } else {
            navigate(`/journals/${date}`)
          }
          break

        case "extension":
          const extensionId = data.extensionId
          await installExtension(extensionId)
          break

        default:
          console.warn("Unhandled protocol action:", action)
      }
    },
    [createDocWithMarkdown, navigate, installExtension]
  )

  useEffect(() => {
    if (!isDesktopMode) return
    listenerRef.current = handleProtocolUrl
    const listenerId = window.eidos.on(
      EidosProtocolUrlChannelName,
      listenerRef.current
    )
    return () => {
      if (listenerId) {
        window.eidos.off(EidosProtocolUrlChannelName, listenerId)
      }
    }
  }, [handleProtocolUrl])
}
