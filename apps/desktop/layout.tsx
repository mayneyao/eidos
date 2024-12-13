import "@/styles/globals.css"
import { useEffect } from "react"
import { Outlet } from "react-router-dom"

import { useAppStoreBase } from "@/lib/store/app-store"
import { useWorker } from "@/hooks/use-worker"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { BlockUIDialog } from "@/components/block-ui-dialog"
import { CommandDialogDemo } from "@/components/cmdk"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeUpdater } from "@/components/theme-updater"

import { useProtocolUrl } from "./hooks/useProtocolUrl"

export default function RootLayout() {
  const { isInitialized, initWorker } = useWorker()
  const { isSidebarOpen } = useAppStoreBase()

  useProtocolUrl()
  useEffect(() => {
    if (!isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SidebarProvider defaultOpen={isSidebarOpen}>
        {/* Transparent titlebar for dragging */}
        <div
          className="h-[8px] w-full bg-transparent absolute top-0 left-0"
          id="drag-region"
        ></div>
        {/* APP MODEL， a sidebar and main */}
        <div className="flex h-screen w-screen overflow-auto">
          <Outlet />
        </div>
        <CommandDialogDemo />
        <ShortCuts />
      </SidebarProvider>
      <TailwindIndicator />
      <Toaster />
      <BlockUIDialog />
      <ThemeUpdater />
    </ThemeProvider>
  )
}
