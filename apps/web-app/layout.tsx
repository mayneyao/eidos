import "@/styles/globals.css"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Outlet } from "react-router-dom"

import { isStagingMode } from "@/lib/env"
import { useAppStoreBase } from "@/lib/store/app-store"
import { useWorker } from "@/hooks/use-worker"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { BlockUIDialog } from "@/components/block-ui-dialog"
import { CommandDialogDemo } from "@/components/cmdk"
import { ReloadPrompt } from "@/components/reload-prompt"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeUpdater } from "@/components/theme-updater"

export default function RootLayout() {
  const { isInitialized, initWorker } = useWorker()
  const { isSidebarOpen } = useAppStoreBase()
  const { t } = useTranslation()

  useEffect(() => {
    if (!isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SidebarProvider defaultOpen={isSidebarOpen}>
        {isStagingMode && (
          <div className="fixed right-0 bottom-0 z-50 rounded-tl-lg bg-yellow-500 px-3 py-1 text-sm font-medium text-yellow-950">
            {t("common.tips.staging")}
          </div>
        )}
        <div className="flex h-screen w-screen overflow-auto">
          <div className="h-full w-full grow">
            <Outlet />
          </div>
        </div>
        <CommandDialogDemo />
        <ShortCuts />
      </SidebarProvider>
      <TailwindIndicator />
      <Toaster />
      <BlockUIDialog />
      <ReloadPrompt />
      <ThemeUpdater />
    </ThemeProvider>
  )
}
