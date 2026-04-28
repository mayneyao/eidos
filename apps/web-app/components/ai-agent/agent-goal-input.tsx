import { SendIcon, Loader2 } from "lucide-react"
import { useCallback, useRef } from "react"

import { Button } from "@/components/ui/button"
import { AIModelSelect } from "@/components/ai/ai-model-select"
import { useAgentStore } from "./agent-store"
import { useAppStore } from "@/apps/web-app/store/app-store"

interface AgentGoalInputProps {
  onSubmit: (goal: string, model: string) => void
  isRunning: boolean
}

export function AgentGoalInput({ onSubmit, isRunning }: AgentGoalInputProps) {
  const { goalInput, setGoalInput } = useAgentStore()
  const { aiModel, setAIModel } = useAppStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const goal = goalInput.trim()
    if (!goal || isRunning) return
    onSubmit(goal, aiModel)
    setGoalInput("")
  }, [goalInput, isRunning, aiModel, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want the AI Agent to do? (e.g., 'List all documents and create a summary table')"
          className="min-h-[80px] w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          disabled={isRunning}
          autoFocus
        />
        <div className="flex items-center justify-between">
          <AIModelSelect value={aiModel} onValueChange={setAIModel} size="sm" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Cmd+Enter to send
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!goalInput.trim() || isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <SendIcon className="h-4 w-4 mr-1" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
