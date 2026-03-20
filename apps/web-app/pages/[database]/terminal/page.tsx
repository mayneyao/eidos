"use client"

import { useEffect, useState } from "react"
import { TerminalIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useTabTitle } from "@/hooks/use-tab-title"
import { TerminalInstance } from "@/components/integrated-terminal/terminal-instance"

export default function TerminalPage() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [spacePath, setSpacePath] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  useTabTitle("Terminal")

  // Get space path for terminal
  useEffect(() => {
    const getSpacePath = async () => {
      try {
        if (space) {
          const spaceInfo = await window.eidos?.space?.getById(space)
          if (spaceInfo?.path) {
            setSpacePath(spaceInfo.path)
            return
          }
        }

        // Fallback: try get-current-space
        const currentSpace = await window.eidos?.space?.getCurrent()
        if (currentSpace?.path) {
          setSpacePath(currentSpace.path)
          return
        }
      } catch (e) {
        console.error("[TerminalPage] Failed to get space path:", e)
      } finally {
        setIsLoading(false)
      }
    }
    getSpacePath()
  }, [space])

  // Create terminal session
  useEffect(() => {
    if (!spacePath) return

    const createTerminal = async () => {
      try {
        const result = await window.eidos?.terminal?.create({
          cwd: spacePath,
          cols: 80,
          rows: 24,
        })

        if (result?.success && result.sessionId) {
          setSessionId(result.sessionId)
        }
      } catch (e) {
        console.error("[TerminalPage] Failed to create terminal:", e)
      }
    }

    createTerminal()

    // Cleanup on unmount
    return () => {
      if (sessionId) {
        window.eidos?.terminal?.kill(sessionId)
      }
    }
  }, [spacePath])

  if (isLoading || !spacePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <TerminalIcon className="h-8 w-8 text-muted-foreground/50 animate-pulse" />
          <p className="text-sm text-muted-foreground">
            {t("terminal.loading", "Loading...")}
          </p>
        </div>
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <TerminalIcon className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("terminal.failedToCreate", "Failed to create terminal session")}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("common.retry", "Retry")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-[500px] p-4">
      <div className="h-full bg-background overflow-hidden">
        <TerminalInstance sessionId={sessionId} isActive={true} />
      </div>
    </div>
  )
}
