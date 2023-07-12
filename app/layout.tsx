"use client"

import "@/styles/globals.css"
import { useEffect } from "react"
import { Outlet } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useWorker } from "@/hooks/use-worker"
import { Toaster } from "@/components/ui/toaster"
import { AIChat } from "@/components/ai-chat/ai-chat"
import { CommandDialogDemo } from "@/components/cmdk"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"

import { useSpaceAppStore } from "./[database]/store"

export default function RootLayout() {
  const { isAiOpen } = useSpaceAppStore()
  const { isInitialized, initWorker } = useWorker()

  useEffect(() => {
    // load worker when app start
    if (!isInitialized) {
      initWorker()
    }
  }, [initWorker, isInitialized])

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("h-screen bg-background font-sans antialiased")}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {/* APP MODEL， a sidebar and main */}
          <div className="flex h-screen w-screen overflow-auto">
            <div className="h-full grow">
              <Outlet />
            </div>
            {isAiOpen && <AIChat />}
          </div>
          <CommandDialogDemo />
          <ShortCuts />
          <TailwindIndicator />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
