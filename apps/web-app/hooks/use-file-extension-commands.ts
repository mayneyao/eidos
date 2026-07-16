import { useCallback, useEffect, useRef, useState } from "react"

import { isDesktopMode } from "@/lib/env"

type FileExtensionCommandPalette = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.listCommandPalette>
>
export type FileExtensionCommand =
  FileExtensionCommandPalette["commands"][number]
export type FileExtensionPanel = FileExtensionCommandPalette["panels"][number]

const EMPTY_PALETTE: FileExtensionCommandPalette = {
  commands: [],
  panels: [],
}

export function useFileExtensionCommands(spaceId?: string) {
  const [palette, setPalette] =
    useState<FileExtensionCommandPalette>(EMPTY_PALETTE)
  const refreshGeneration = useRef(0)

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    if (
      !spaceId ||
      !isDesktopMode ||
      !window.eidos?.fileExtensions?.listCommandPalette
    ) {
      if (generation === refreshGeneration.current) setPalette(EMPTY_PALETTE)
      return
    }
    try {
      const nextPalette =
        await window.eidos.fileExtensions.listCommandPalette(spaceId)
      if (generation === refreshGeneration.current) {
        setPalette(nextPalette)
      }
    } catch {
      if (generation === refreshGeneration.current) setPalette(EMPTY_PALETTE)
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

  const openPanel = useCallback(
    async (panel: FileExtensionPanel) => {
      if (!spaceId) throw new Error("A file Space is required")
      return window.eidos.fileExtensions.openPanel(spaceId, {
        packageId: panel.packageId,
        contentDigest: panel.contentDigest,
        permissionHash: panel.permissionHash,
        panelId: panel.id,
      })
    },
    [spaceId]
  )

  return {
    commands: palette.commands,
    panels: palette.panels,
    execute,
    openPanel,
    refresh,
  }
}
