import "@/styles/globals.css"
import { useEffect } from "react"

import { useSyncFileActions } from "@/hooks/use-all-file-actions"
import { useSyncFileHandlers } from "@/hooks/use-all-file-handlers"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AuthProvider } from "@/components/auth-provider"
import { BlockUIDialog } from "@/components/block-ui-dialog"
import { CommandDialogDemo } from "@/components/cmdk"
import { DevTools } from "@/components/dev-tools"
import { GlobalSearch } from "@/components/global-search"
import { GodModeTooltip } from "@/components/god-mode-tooltip"
import { ShortCuts } from "@/components/keyboard-shortcuts/shortcuts"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeUpdater } from "@/components/theme-updater"
import { Toaster } from "@/components/toaster"
import { WindowControls } from "@/components/window-controls"
import { useWorker } from "@/apps/web-app/hooks/use-worker"
import { useAppStoreBase } from "@/apps/web-app/store/app-store"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"
import { ExtensionSemanticUiHost } from "@/apps/web-app/components/file-extensions/extension-semantic-ui-host"
import { ExtensionPanelOpenHost } from "@/apps/web-app/components/file-extensions/extension-panel-open-host"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { shouldEnableLegacySpaceRuntime } from "@/apps/web-app/space-runtime-policy"

import { useProtocolUrl } from "./hooks/useProtocolUrl"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { currentSpace } = useCurrentSpace()
  const legacyRuntimeEnabled = shouldEnableLegacySpaceRuntime(
    currentSpace?.mode
  )
  const { initWorker } = useWorker(legacyRuntimeEnabled)
  const { isSidebarOpen, setSidebarOpen } = useAppStoreBase()
  useProtocolUrl()
  useSyncFileHandlers(legacyRuntimeEnabled)
  useSyncFileActions(legacyRuntimeEnabled)
  useEffect(() => {
    const listenerId = window.eidos?.on(
      "window:flush-pending-writes",
      async (_event: Electron.IpcRendererEvent, requestId: unknown) => {
        if (typeof requestId !== "string") return
        const success = await flushPendingFileWrites()
        window.eidos?.send(
          `window:flush-pending-writes:complete:${requestId}`,
          success
        )
      }
    )
    return () => {
      if (listenerId) {
        window.eidos?.off("window:flush-pending-writes", listenerId)
      }
    }
  }, [])
  useEffect(() => {
    return initWorker()
  }, [initWorker])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <SidebarProvider open={isSidebarOpen} onOpenChange={setSidebarOpen}>
          {/* Transparent titlebar for dragging */}
          <div
            className="h-[8px] w-full bg-transparent absolute top-0 left-0"
            id="drag-region"
          ></div>
          {/* APP MODEL， a sidebar and main */}
          <div className="flex h-screen w-screen overflow-auto">{children}</div>
          <WindowControls />
          <CommandDialogDemo />
          <ShortCuts />
          <GlobalSearch />
          <ExtensionSemanticUiHost />
          <ExtensionPanelOpenHost />
        </SidebarProvider>
        <DevTools />

        <Toaster />
        <BlockUIDialog />
        <ThemeUpdater />
        <GodModeTooltip />
      </AuthProvider>
    </ThemeProvider>
  )
}
