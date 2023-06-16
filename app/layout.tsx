"use client"

import "@/styles/globals.css"
import { useEffect } from "react"

import { fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/toaster"
import { CommandDialogDemo } from "@/components/cmdk"
import { ShortCuts } from "@/components/shortcuts"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => console.log("scope is: ", registration.scope))
    }
  }, [])
  return (
    <>
      <html lang="en" suppressHydrationWarning>
        <body
          className={cn(
            "h-screen bg-background font-sans antialiased",
            fontSans.variable
          )}
        >
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            {/* APP MODEL， a sidebar and main */}
            <div className="h-screen w-screen overflow-auto">{children}</div>
            {/* global components */}
            <CommandDialogDemo />
            <ShortCuts />
            <TailwindIndicator />
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </>
  )
}
