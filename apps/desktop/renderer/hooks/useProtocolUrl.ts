import { useCurrentUser } from "@/apps/web-app/hooks/user-current-user"
import { EidosProtocolUrlChannelName } from "@/lib/const"
import { isDesktopMode } from "@/lib/env"
import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { getToday, uuidv7 } from "@/lib/utils"
import { useCallback, useEffect, useRef } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useExtensionInstaller } from "./useExtensionInstaller"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"
import { toSpaceFileUrl } from "@/apps/web-app/components/file-space/file-path"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useToast } from "@/components/ui/use-toast"

export const useProtocolUrl = () => {
  const { navigate } = useRouterAdapter()
  const { id: userId } = useCurrentUser()
  const listenerRef = useRef<any>()
  const { installExtension } = useExtensionInstaller()
  const { currentSpace } = useCurrentSpace()
  const { toast } = useToast()

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
      const activeSpace = await window.eidos.spaceMgmt
        .getCurrentSpace()
        .catch(() => currentSpace)
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
                if (!(await flushPendingFileWrites())) {
                  throw new Error(
                    "Eidos could not save the current file before switching Spaces."
                  )
                }
                const result = await window.eidos.spaceMgmt.switchSpace(spaceId)
                if (!result.success) {
                  throw new Error(result.error || "Unable to open this Space")
                }
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

        case "file":
          // Handle eidos file command from CLI (like "code file.md")
          const filePath = searchParams["path"]
          if (filePath) {
            try {
              if (activeSpace?.mode === "file") {
                const relativePath =
                  await window.eidos.spaceMgmt.getRelativeFilePath(
                    activeSpace.id,
                    filePath
                  )
                if (!relativePath) {
                  throw new Error("The file is outside the current Space")
                }
                navigate(toSpaceFileUrl(relativePath))
                break
              }
              const encodedPath = encodeURIComponent(filePath)
              navigate(`/editor#${encodedPath}`)
            } catch (error) {
              console.error("Unable to open file from protocol:", error)
              toast({
                title: "Unable to open file",
                description:
                  error instanceof Error ? error.message : String(error),
                variant: "destructive",
              })
            }
          }
          break

        case "search":
          if ("space" in searchParams) {
            const spaceId = searchParams["space"]
          }
          break

        case "new":
          if (activeSpace?.mode === "file") {
            toast({
              title: "Command unavailable for file Spaces",
              description:
                "Create a Markdown note from Eidos while file-Space CLI creation is being added.",
            })
            break
          }
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
          if (activeSpace?.mode === "file") {
            toast({
              title: "Command unavailable for file Spaces",
              description:
                "Daily-note protocol commands currently require a legacy Space.",
            })
            break
          }
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
          if (activeSpace?.mode === "file") {
            toast({
              title: "Extensions are not available in file Spaces yet",
            })
            break
          }
          const extensionId = data.extensionId
          await installExtension(extensionId)
          break

        default:
          console.warn("Unhandled protocol action:", action)
      }
    },
    [createDocWithMarkdown, currentSpace, navigate, installExtension, toast]
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
