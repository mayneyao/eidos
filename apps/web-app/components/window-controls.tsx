import { useEffect, useState } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { cn, isStandaloneBlocksPath } from "@/lib/utils"
import { isWindowsDesktop } from "@/lib/web/helper"
import { Button } from "@/components/ui/button"

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const unsubscribe = window.eidos.onWindowStateChange((state) => {
      setIsMaximized(state === "maximized")
    })
    return () => unsubscribe()
  }, [])

  const { location } = useRouterAdapter(); const { pathname } = location
  const isAppWindow = isStandaloneBlocksPath(pathname)

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-50 flex items-center no-drag space-x-1 pr-2 h-[38px]",
        {
          hidden: !isWindowsDesktop || isAppWindow,
        }
      )}
    >
      <Button
        size="xs"
        variant="ghost"
        onClick={() => window.eidos.minimizeWindow()}
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
        </svg>
      </Button>

      <Button
        size="xs"
        variant="ghost"
        onClick={() =>
          isMaximized
            ? window.eidos.unmaximizeWindow()
            : window.eidos.maximizeWindow()
        }
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          {isMaximized ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 7.5h14m0 0v9m0-9H5.25v9h14z"
            />
          )}
        </svg>
      </Button>

      <Button
        size="xs"
        variant="ghost"
        onClick={() => window.eidos.closeWindow()}
        className="hover:bg-red-500/80 hover:text-white"
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </Button>
    </div>
  )
}
