"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { isMac } from "@/lib/web/helper"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Add type declaration for the experimental Navigation API
declare global {
  interface Window {
    navigation?: {
      canGoBack: boolean
      canGoForward: boolean
      addEventListener(
        type: "currententrychange",
        listener: EventListenerOrEventListenerObject
      ): void
      removeEventListener(
        type: "currententrychange",
        listener: EventListenerOrEventListenerObject
      ): void
      // Add other properties/methods if needed
    }
  }
}

export function NavigationControls() {
  const { t } = useTranslation()
  const { navigate } = useRouterAdapter()
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    const navigation = window.navigation
    if (navigation) {
      const updateNavState = () => {
        setCanGoBack(navigation.canGoBack)
        setCanGoForward(navigation.canGoForward)
      }

      updateNavState() // Initial check

      navigation.addEventListener("currententrychange", updateNavState)

      return () => {
        navigation.removeEventListener("currententrychange", updateNavState)
      }
    } else {
      // Fallback for older browsers or environments without window.navigation
      // For simplicity, we'll leave them enabled here.
      setCanGoBack(true) // Assume possible if API not available
      setCanGoForward(true) // Assume possible if API not available
    }
  }, [])

  return (
    <TooltipProvider delayDuration={1000}>
      <div className="flex items-center justify-start gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigate(-1)}
              disabled={!canGoBack}
              aria-label={t("common.tooltip.goBack")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex items-center gap-2">
              <p>{t("common.tooltip.goBack")}</p>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">{isMac() ? "⌘" : "Meta"}</span>[
              </kbd>
            </div>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigate(1)}
              disabled={!canGoForward}
              aria-label={t("common.tooltip.goForward")}
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex items-center gap-2">
              <p>{t("common.tooltip.goForward")}</p>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">{isMac() ? "⌘" : "Meta"}</span>]
              </kbd>
            </div>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => window.location.reload()}
              aria-label={t("common.tooltip.reload")}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex items-center gap-2">
              <p>{t("common.tooltip.reload")}</p>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">{isMac() ? "⌘" : "Meta"}</span>R
              </kbd>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
