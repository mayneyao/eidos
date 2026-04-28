"use client"

import { Suspense } from "react"

import { Loading } from "@/components/loading"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppsStore } from "@/apps/web-app/pages/[database]/store"
import { TerminalInstance } from "@/components/integrated-terminal/terminal-instance"
import { BlockApp } from "@/components/block-renderer/block-app"

import { TempPanel } from "./temp-panel"
import { NodeAppPanel } from "./node-app-panel"

// Terminal panel component for existing session (dragged from bottom panel)
interface ExistingTerminalPanelProps {
  sessionId: string
}

const ExistingTerminalPanel = ({ sessionId }: ExistingTerminalPanelProps) => {
  const { currentApp, setCurrentApp } = useSpaceAppStore()
  const { apps, deleteApp } = useAppsStore()

  // Handle terminal exit - remove tab when terminal exits
  const handleTerminalExit = (exitSessionId: string, exitCode: number) => {
    const terminalAppId = `terminal://${exitSessionId}`

    // Remove from apps list
    if (apps.includes(terminalAppId)) {
      deleteApp(terminalAppId)

      // If this was the current app, close the panel
      if (currentApp === terminalAppId) {
        setCurrentApp("")
      }
    }
  }

  return (
    <div className="h-full w-full bg-background p-2">
      <TerminalInstance
        sessionId={sessionId}
        isActive={true}
        onExit={handleTerminalExit}
      />
    </div>
  )
}

interface RightPanelContentProps {
  height?: number
}

export const RightPanelContent = ({ height }: RightPanelContentProps = {}) => {
  const { tempPanelNode, currentApp } = useSpaceAppStore()

  // Render temp panel if active
  if (tempPanelNode) {
    return <TempPanel />
  }

  // Terminal session dragged from bottom panel
  if (currentApp && currentApp.startsWith("terminal://")) {
    const sessionId = currentApp.replace("terminal://", "")
    return <ExistingTerminalPanel sessionId={sessionId} />
  }

  if (currentApp && currentApp.startsWith("block://")) {
    return (
      <Suspense fallback={<Loading />}>
        <BlockApp url={currentApp} height={height} />
      </Suspense>
    )
  }

  if (currentApp && currentApp.startsWith("node://")) {
    return <NodeAppPanel />
  }

  // Empty panel — no default app
  return null
}
