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
    <div className="border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-2 bg-zinc-50/60 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm">
      <div className="flex flex-col">
        <textarea
          ref={textareaRef}
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want the AI Agent to do?"
          className="min-h-[36px] w-full resize-none bg-transparent px-2 pt-1 text-[13px] leading-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
          disabled={isRunning}
          autoFocus
        />
        <div className="flex items-center justify-between px-1.5 mt-1.5">
          <div className="flex items-center gap-2">
            <AIModelSelect
              value={aiModel}
              onValueChange={setAIModel}
              noBorder
              size="sm"
            />
            {isRunning && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 bg-zinc-100/60 dark:bg-zinc-800/60 px-2 py-0.5 rounded-md animate-in fade-in duration-300 select-none">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>
                  Step {stepCount}/{maxSteps}
                </span>
                <span className="tabular-nums font-mono">
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 select-none">
            {isRunning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-7 px-2.5 rounded-lg text-xs"
              >
                <StopCircleIcon className="h-3.5 w-3.5 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!goalInput.trim() || isRunning}
                className="h-7 px-3 rounded-lg text-xs font-normal"
              >
                <SendIcon className="h-3 w-3 mr-1" />
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
