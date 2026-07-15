import { useCallback, useEffect, useRef, useState } from "react"

import { isDesktopMode } from "@/lib/env"

export type FileExtensionCommand = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.listCommands>
>[number]

export function useFileExtensionCommands(spaceId?: string) {
  const [commands, setCommands] = useState<FileExtensionCommand[]>([])
  const refreshGeneration = useRef(0)

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    if (
      !spaceId ||
      !isDesktopMode ||
      !window.eidos?.fileExtensions?.listCommands
    ) {
      if (generation === refreshGeneration.current) setCommands([])
      return
    }
    try {
      const nextCommands =
        await window.eidos.fileExtensions.listCommands(spaceId)
      if (generation === refreshGeneration.current) {
        setCommands(nextCommands)
      }
    } catch {
      if (generation === refreshGeneration.current) setCommands([])
    }
  }, [spaceId])

  useEffect(() => {
    void refresh()
    if (!spaceId || !isDesktopMode || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:changed",
      (_event: unknown, payload: unknown) => {
        if (
          payload &&
          typeof payload === "object" &&
          "spaceId" in payload &&
          payload.spaceId === spaceId
        ) {
          void refresh()
        }
      }
    )
    return () => {
      refreshGeneration.current += 1
      if (listenerId) window.eidos.off("file-extensions:changed", listenerId)
    }
  }, [refresh, spaceId])

  const execute = useCallback(
    async (command: FileExtensionCommand, resourcePath: string) => {
      if (!spaceId) throw new Error("A file Space is required")
      return window.eidos.fileExtensions.executeCommand(spaceId, {
        packageId: command.packageId,
        contentDigest: command.contentDigest,
        permissionHash: command.permissionHash,
        commandId: command.id,
        resource: { path: resourcePath },
      })
    },
    [spaceId]
  )

  return { commands, execute, refresh }
}
