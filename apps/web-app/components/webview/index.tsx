"use client"

import { useEffect } from "react"
import { Globe } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  useWebviewStore,
  defaultWebviewState,
} from "@/apps/web-app/store/webview-store"
import { WebviewContent } from "./WebviewContent"
import { WebviewToolbar } from "./WebviewToolbar"

export function Webview({ url }: { url: string }) {
  const { tabId } = useTabContext()
  const state = useWebviewStore((s) => s.states[tabId])
  const setWebviewState = useWebviewStore((s) => s.setWebviewState)

  const { displayUrl = "", pageTitle = "" } = state || defaultWebviewState

  useTabTitle(pageTitle || displayUrl || url || "Webview")

  useEffect(() => {
    setWebviewState(tabId, { displayUrl: url })
  }, [url, tabId, setWebviewState])

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Globe className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No URL provided</p>
        </div>
      </div>
    )
  }

  if (!isDesktopMode) {
    return (
      <iframe
        src={url}
        title={url}
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <WebviewToolbar />
      <WebviewContent url={url} />
    </div>
  )
}
