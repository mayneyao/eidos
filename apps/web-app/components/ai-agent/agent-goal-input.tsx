import { SendIcon, Loader2, StopCircleIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { AIModelSelect } from "@/components/ai/ai-model-select"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAgentStore } from "./agent-store"

interface AgentGoalInputProps {
  onSubmit: (goal: string, model: string) => void
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

export function AgentGoalInput({
  onSubmit,
  isRunning,
  stepCount,
  maxSteps,
  elapsedMs,
  onStop,
}: AgentGoalInputProps) {
  const { goalInput, setGoalInput } = useAgentStore()
  const { aiModel, setAIModel } = useAppStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  const handleSubmit = useCallback(() => {
    const goal = goalInput.trim()
    if (!goal || isRunning) return
    onSubmit(goal, aiModel)
    setGoalInput("")
  }, [goalInput, isRunning, aiModel, onSubmit, setGoalInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="border rounded-2xl p-4 bg-background shadow-sm border-border">
      <div className="flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want the AI Agent to do? (e.g., 'List all documents and create a summary table')"
          className="min-h-[60px] w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          disabled={isRunning}
          autoFocus
        />
        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          <div className="flex items-center gap-3">
            <AIModelSelect
              value={aiModel}
              onValueChange={setAIModel}
              size="sm"
            />
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-l border-border/50 pl-3 animate-in fade-in duration-300">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span>
                  Step {stepCount}/{maxSteps}
                </span>
                <span className="tabular-nums font-mono">
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isRunning && (
              <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">
                Enter to send
              </span>
            )}
            {isRunning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-9 px-4 rounded-xl"
              >
                <StopCircleIcon className="h-4 w-4 mr-2" />
                Stop Agent
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!goalInput.trim() || isRunning}
                className="h-9 px-4 rounded-xl"
              >
                <SendIcon className="h-4 w-4 mr-2" />
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
