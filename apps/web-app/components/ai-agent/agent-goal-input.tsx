import { SendIcon, Loader2, StopCircleIcon, Brain } from "lucide-react"
import { useCallback, useEffect, useRef, useState, useMemo } from "react"

import { Button } from "@/components/ui/button"
import { AIModelSelect } from "@/components/ai/ai-model-select"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useIsActiveTab } from "@/apps/web-app/hooks/use-is-active-tab"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useAgentSession } from "./agent-context"
import { SkillPopover } from "./skill-popover"

interface SkillMeta {
  name: string
  description: string
  dirName: string
}

interface AgentGoalInputProps {
  onSubmit: (goal: string, model: string) => void
  isRunning: boolean
  stepCount: number
  maxSteps: number
  elapsedMs: number
  onStop: () => void
  selectedSkills: string[]
  onSelectedSkillsChange: (skills: string[]) => void
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
  selectedSkills,
  onSelectedSkillsChange,
}: AgentGoalInputProps) {
  const {
    goalInput,
    setGoalInput,
    sessionId,
    thinkingLevel,
    setThinkingLevel,
  } = useAgentSession()
  const { aiModel, setAIModel } = useAppStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(elapsedMs)

  // Skills state
  const [availableSkills, setAvailableSkills] = useState<SkillMeta[]>([])
  const [skillPopoverOpen, setSkillPopoverOpen] = useState(false)
  const [skillActiveIndex, setSkillActiveIndex] = useState(0)
  const [triggerState, setTriggerState] = useState<{
    active: boolean
    startIndex: number
    query: string
  }>({ active: false, startIndex: -1, query: "" })

  // Filtered skills for keyboard navigation
  const filteredSkills = useMemo(() => {
    const q = triggerState.query.toLowerCase()
    if (!q) return availableSkills
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  }, [availableSkills, triggerState.query])

  // Reset active index when filter query changes
  useEffect(() => {
    setSkillActiveIndex(0)
  }, [triggerState.query])

  useEffect(() => {
    fetch("/api/agent/skills")
      .then((r) => r.json())
      .then((data) => setAvailableSkills(data.skills ?? []))
      .catch(() => {})
  }, [])

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

  const isActiveTab = useIsActiveTab()

  useEffect(() => {
    const unsubscribe = useTabStore.subscribe((state) => {
      if (state.getActiveTabId() !== sessionId) {
        textareaRef.current?.blur()
      }
    })
    return unsubscribe
  }, [sessionId])

  useEffect(() => {
    if (isActiveTab && !isRunning) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [isActiveTab, isRunning])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isActiveTab) return

      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        const isInput =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)

        if (!isInput) {
          e.preventDefault()
          textareaRef.current?.focus()
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [isActiveTab])

  const handleSkillSelect = useCallback(
    (skill: SkillMeta) => {
      const before = goalInput.slice(0, triggerState.startIndex)
      const after = goalInput.slice(
        triggerState.startIndex + 1 + triggerState.query.length
      )
      const newGoal = `${before}$${skill.dirName} ${after}`
      setGoalInput(newGoal)

      if (!selectedSkills.includes(skill.dirName)) {
        onSelectedSkillsChange([...selectedSkills, skill.dirName])
      }

      setTriggerState({ active: false, startIndex: -1, query: "" })
      setSkillPopoverOpen(false)

      setTimeout(() => textareaRef.current?.focus(), 0)
    },
    [
      goalInput,
      triggerState,
      selectedSkills,
      onSelectedSkillsChange,
      setGoalInput,
    ]
  )

  const handleSubmit = useCallback(() => {
    const goal = goalInput.trim()
    if (!goal) return
    onSubmit(goal, aiModel)
    setGoalInput("")
  }, [goalInput, aiModel, onSubmit, setGoalInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (skillPopoverOpen && filteredSkills.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSkillActiveIndex((i) => (i + 1) % filteredSkills.length)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSkillActiveIndex(
            (i) => (i - 1 + filteredSkills.length) % filteredSkills.length
          )
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSkillSelect(filteredSkills[skillActiveIndex])
          return
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === "Escape") {
        if (skillPopoverOpen) {
          e.preventDefault()
          setSkillPopoverOpen(false)
          setTriggerState({ active: false, startIndex: -1, query: "" })
        } else {
          e.preventDefault()
          textareaRef.current?.blur()
          const scrollContainer = document.getElementById(
            "agent-chat-scroll-container"
          )
          if (scrollContainer) {
            scrollContainer.focus()
          }
        }
      }
    },
    [
      handleSubmit,
      skillPopoverOpen,
      filteredSkills,
      skillActiveIndex,
      handleSkillSelect,
    ]
  )

  return (
    <>
      <SkillPopover
        open={skillPopoverOpen}
        onOpenChange={setSkillPopoverOpen}
        skills={availableSkills}
        onSelect={handleSkillSelect}
        filterQuery={triggerState.query}
        anchorRef={containerRef}
        activeIndex={skillActiveIndex}
        onActiveIndexChange={setSkillActiveIndex}
      />
      <div
        ref={containerRef}
        className="border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-2 bg-zinc-50/60 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm relative"
      >
        <div className="flex flex-col">
          <textarea
            ref={textareaRef}
            value={goalInput}
            onChange={(e) => {
              const newValue = e.target.value
              setGoalInput(newValue)

              // Detect $ trigger for skill picker
              const cursorPos = e.target.selectionStart
              const textBeforeCursor = newValue.slice(0, cursorPos)
              const lastDollarIndex = textBeforeCursor.lastIndexOf("$")

              if (lastDollarIndex !== -1) {
                const afterDollar = textBeforeCursor.slice(lastDollarIndex + 1)
                const charBeforeDollar =
                  lastDollarIndex > 0 ? newValue[lastDollarIndex - 1] : " "
                if (
                  /\s/.test(charBeforeDollar) &&
                  /^[a-z0-9-]*$/.test(afterDollar)
                ) {
                  setTriggerState({
                    active: true,
                    startIndex: lastDollarIndex,
                    query: afterDollar,
                  })
                  setSkillPopoverOpen(true)
                  return
                }
              }
              setTriggerState({ active: false, startIndex: -1, query: "" })
              setSkillPopoverOpen(false)
            }}
            onKeyDown={handleKeyDown}
            placeholder="What do you want the AI Agent to do? (Press / to focus)"
            className="min-h-[36px] w-full resize-none bg-transparent px-2 pt-1 text-[13px] leading-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
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
              <div className="flex items-center gap-1">
                <Brain className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                <select
                  value={thinkingLevel ?? "off"}
                  onChange={(e) =>
                    setThinkingLevel?.(
                      e.target.value as "off" | "low" | "medium" | "high"
                    )
                  }
                  className="h-7 text-[11px] bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer text-zinc-500 dark:text-zinc-400 appearance-none pr-4"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0 center",
                  }}
                >
                  <option value="off">Thinking: off</option>
                  <option value="low">Thinking: low</option>
                  <option value="medium">Thinking: medium</option>
                  <option value="high">Thinking: high</option>
                </select>
              </div>
              {isRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStop}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-7 px-2.5 rounded-lg text-xs"
                >
                  <StopCircleIcon className="h-3.5 w-3.5 mr-1" />
                  Stop
                </Button>
              )}
              {(!isRunning || goalInput.trim()) && (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!goalInput.trim()}
                  className="h-7 px-3 rounded-lg text-xs font-normal"
                >
                  <SendIcon className="h-3 w-3 mr-1" />
                  {isRunning ? "Interrupt & Send" : "Send"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
