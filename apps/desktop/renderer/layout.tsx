import "@/styles/globals.css"
import { useEffect } from "react"
import { Outlet } from "react-router-dom"

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

import { useProtocolUrl } from "./hooks/useProtocolUrl"

export default function RootLayout() {
  const { isInitialized, initWorker } = useWorker()
  const { isSidebarOpen, setSidebarOpen } = useAppStoreBase()
  useProtocolUrl()
  useSyncFileHandlers()
  useSyncFileActions()
  useEffect(() => {
    if (!isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <SidebarProvider
          defaultOpen={isSidebarOpen}
          open={isSidebarOpen}
          onOpenChange={setSidebarOpen}
        >
          {/* Transparent titlebar for dragging */}
          <div
            className="h-[8px] w-full bg-transparent absolute top-0 left-0"
            id="drag-region"
          ></div>
          {/* APP MODEL， a sidebar and main */}
          <div className="flex h-screen w-screen overflow-auto">
            <Outlet />
          </div>
          <WindowControls />
          <CommandDialogDemo />
          <ShortCuts />
          <GlobalSearch />
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
