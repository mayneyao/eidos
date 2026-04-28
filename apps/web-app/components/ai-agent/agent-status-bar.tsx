import { useEffect, useState } from "react"
import { StopCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

interface AgentStatusBarProps {
  isRunning: boolean
  stepCount: number
  maxSteps: number
  elapsedMs: number
  onStop: () => void
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

export function AgentStatusBar({
  isRunning,
  stepCount,
  maxSteps,
  elapsedMs,
  onStop,
}: AgentStatusBarProps) {
  const [elapsed, setElapsed] = useState(elapsedMs)

  useEffect(() => {
    if (!isRunning) {
      setElapsed(elapsedMs)
      return
    }
    const start = Date.now() - elapsedMs
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, elapsedMs])

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        {isRunning ? (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Running · Step {stepCount}/{maxSteps}
          </span>
        ) : (
          <span>Ready</span>
        )}
        <span>{formatElapsed(elapsed)}</span>
      </div>
      {isRunning && (
        <Button variant="ghost" size="xs" onClick={onStop}>
          <StopCircleIcon className="h-4 w-4 mr-1" />
          Stop
        </Button>
      )}
    </div>
  )
}
