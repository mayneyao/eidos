import { SendIcon, Loader2, StopCircleIcon, Brain, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useCallback, useEffect, useRef, useState, useMemo } from "react"

import { Button } from "@/components/ui/button"
import { useAIConfigStore } from "@/components/settings/stores"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useIsActiveTab } from "@/apps/web-app/hooks/use-is-active-tab"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useNodeStore } from "@/apps/web-app/store/node-store"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useAgentSession } from "./agent-context"
import { ContextPopover, type ContextItem } from "./context-popover"
import { useTriggerState } from "./hooks"
import { PermissionBanner, usePermissionContext } from "@/components/permission"
import { ItemIcon } from "../sidebar/nodes"

interface SkillMeta {
  name: string
  description: string
  dirName: string
}

export interface NodeMention {
  id: string
  name: string
  type: string
}

interface AgentGoalInputProps {
  onSubmit: (goal: string, model: string, mentions?: NodeMention[]) => void
  isRunning: boolean
  onStop: () => void
  selectedSkills: string[]
  onSelectedSkillsChange: (skills: string[]) => void
  initialValue?: string
  editingMode?: boolean
  "data-editing-input"?: string
}

export function AgentGoalInput({
  onSubmit,
  isRunning,
  onStop,
  selectedSkills,
  onSelectedSkillsChange,
  initialValue,
  editingMode,
  "data-editing-input": dataEditingInput,
}: AgentGoalInputProps) {
  const {
    goalInput,
    setGoalInput,
    sessionId,
    thinkingLevel,
    setThinkingLevel,
  } = useAgentSession()
  const { aiModel, setAIModel } = useAppStore()
  const { aiConfig } = useAIConfigStore()

  const modelsByProvider = useMemo(() => {
    const providerMap = new Map<string, string[]>()
    aiConfig.llmProviders
      .filter((item: any) => item.enabled)
      .forEach((provider: any) => {
        const models = provider.models
          .split(",")
          .map((m: string) => m.trim())
          .filter((m: string) => m.length > 0)
        if (models.length > 0) {
          providerMap.set(provider.name, models)
        }
      })
    return providerMap
  }, [aiConfig])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  const [availableSkills, setAvailableSkills] = useState<SkillMeta[]>([])
  const [mentions, setMentions] = useState<NodeMention[]>([])
  const {
    triggerState,
    setTriggerState,
    activeIndex: triggerActiveIndex,
    setActiveIndex: setTriggerActiveIndex,
    resetTrigger,
  } = useTriggerState()

  const [isDragOver, setIsDragOver] = useState(false)

  const { permissionRequests } = usePermissionContext()
  const pendingCount = permissionRequests.length

  useEffect(() => {
    setTriggerActiveIndex(0)
  }, [triggerState.query, setTriggerActiveIndex])

  useEffect(() => {
    fetch("/api/agent/skills")
      .then((r) => r.json())
      .then((data) => setAvailableSkills(data.skills ?? []))
      .catch(() => {})
  }, [])

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

  const { nodeMap, nodeIds } = useNodeStore()

  const allNodes = useMemo(() => {
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((n) => n && !n.is_deleted && n.type !== "folder")
  }, [nodeIds, nodeMap])

  const contextItems = useMemo<ContextItem[]>(() => {
    if (triggerState.type === "skill") {
      return availableSkills.map((s) => ({
        id: s.dirName,
        name: s.name,
        description: s.description,
        data: s,
      }))
    } else if (triggerState.type === "node") {
      return allNodes.map((n) => ({
        id: n.id,
        name: n.name,
        description: `[${n.type}] ${n.name}`,
        icon: <ItemIcon type={n.type} className="h-4 w-4" />,
        data: n,
      }))
    }
    return []
  }, [triggerState.type, availableSkills, allNodes])

  const filteredItems = useMemo(() => {
    const q = (triggerState.query || "").toLowerCase()
    return contextItems.filter(
      (item) =>
        (item.name || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
    )
  }, [contextItems, triggerState.query])

  const handleItemSelect = useCallback(
    (item: ContextItem) => {
      const before = goalInput.slice(0, triggerState.startIndex)
      const after = goalInput.slice(
        triggerState.startIndex + 1 + triggerState.query.length
      )

      let textToInsert = ""
      if (triggerState.type === "skill") {
        const skill = item.data
        textToInsert = `$${skill.dirName}`
        if (!selectedSkills.includes(skill.dirName)) {
          onSelectedSkillsChange([...selectedSkills, skill.dirName])
        }
      } else {
        // Node mention: insert @name, store structured reference
        const node = item.data as ITreeNode
        textToInsert = `@${node.name}`
        const exists = mentions.find((m) => m.id === node.id)
        if (!exists) {
          setMentions((prev) => [
            ...prev,
            { id: node.id, name: node.name, type: node.type },
          ])
        }
      }

      const newGoal = `${before}${textToInsert} ${after}`
      setGoalInput(newGoal)
      resetTrigger()

      setTimeout(() => {
        textareaRef.current?.focus()
        const newPos = before.length + textToInsert.length + 1
        textareaRef.current?.setSelectionRange(newPos, newPos)
      }, 0)
    },
    [
      goalInput,
      triggerState,
      selectedSkills,
      onSelectedSkillsChange,
      setGoalInput,
      mentions,
    ]
  )

  // Remove a single mention chip
  const removeMention = useCallback((id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id))
  }, [])

  useEffect(() => {
    if (initialValue !== undefined) {
      setGoalInput(initialValue)
      setTimeout(() => {
        const el = textareaRef.current
        if (el) {
          el.style.height = "auto"
          el.style.height = Math.min(el.scrollHeight, 200) + "px"
        }
      }, 0)
    }
  }, [initialValue, setGoalInput])

  const handleSubmit = useCallback(() => {
    const goal = goalInput.trim()
    if (!goal) return
    onSubmit(goal, aiModel, mentions.length > 0 ? mentions : undefined)
    if (!editingMode) {
      setGoalInput("")
      setMentions([])
      const el = textareaRef.current
      if (el) {
        el.style.height = "auto"
      }
    }
  }, [
    goalInput,
    aiModel,
    onSubmit,
    setGoalInput,
    editingMode,
    mentions,
    textareaRef,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (triggerState.active && filteredItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setTriggerActiveIndex((i) => (i + 1) % filteredItems.length)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setTriggerActiveIndex(
            (i) => (i - 1 + filteredItems.length) % filteredItems.length
          )
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleItemSelect(filteredItems[triggerActiveIndex])
          return
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === "Escape") {
        if (triggerState.active) {
          e.preventDefault()
          resetTrigger()
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
      triggerState,
      filteredItems,
      triggerActiveIndex,
      handleItemSelect,
    ]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const dragDataStr = e.dataTransfer.getData("application/eidos-node")
      if (!dragDataStr) return

      try {
        const dragData = JSON.parse(dragDataStr)
        const nodes = dragData.nodes || []

        const newMentions: NodeMention[] = []
        for (const node of nodes) {
          const nodeId = node.metadata?.nodeId || node.id
          const nodeType = node.metadata?.nodeType || "doc"
          const nodeName =
            node.metadata?.name ||
            node.name ||
            node.path?.split("/").pop() ||
            "Untitled"

          if (nodeId && !mentions.find((m) => m.id === nodeId)) {
            newMentions.push({ id: nodeId, name: nodeName, type: nodeType })
          }
        }

        if (newMentions.length > 0) {
          setMentions((prev) => [...prev, ...newMentions])

          const textParts = newMentions.map((m) => `@${m.name}`).join(" ")
          const textarea = textareaRef.current
          if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const newGoal =
              goalInput.substring(0, start) +
              textParts +
              " " +
              goalInput.substring(end)
            setGoalInput(newGoal)
            setTimeout(() => {
              textarea.focus()
              const newPos = start + textParts.length + 1
              textarea.setSelectionRange(newPos, newPos)
            }, 0)
          } else {
            setGoalInput(
              goalInput ? `${goalInput.trim()} ${textParts} ` : `${textParts} `
            )
          }
        }
      } catch (err) {
        console.error("Failed to parse drop data", err)
      }
    },
    [goalInput, setGoalInput, mentions]
  )

  const typeLabel = (t: string) =>
    t === "table" ? "table" : t === "journal" ? "journal" : "doc"

  return (
    <>
      <ContextPopover
        open={triggerState.active}
        onOpenChange={(open) => !open && resetTrigger()}
        items={filteredItems}
        onSelect={handleItemSelect}
        filterQuery={triggerState.query}
        anchorRef={containerRef}
        activeIndex={triggerActiveIndex}
        onActiveIndexChange={setTriggerActiveIndex}
        title={triggerState.type === "skill" ? "Skills" : "Nodes"}
        emptyText={
          triggerState.type === "skill" ? "No skills found." : "No nodes found."
        }
      />
      {pendingCount > 0 && (
        <div className="pb-2">
          <PermissionBanner />
        </div>
      )}
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border rounded-xl p-2 bg-zinc-50/60 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm relative transition-all duration-200",
          isDragOver
            ? "border-primary ring-2 ring-primary/20 bg-primary/5 dark:bg-primary/10 scale-[1.01]"
            : "border-zinc-200/50 dark:border-zinc-800/50"
        )}
      >
        <div className="flex flex-col">
          {/* Mention chips bar */}
          {mentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-1.5">
              {mentions.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-2 py-0.5 text-[11px] font-medium"
                >
                  <span className="opacity-60 text-[10px]">
                    {typeLabel(m.type)}
                  </span>
                  {m.name}
                  <button
                    type="button"
                    onClick={() => removeMention(m.id)}
                    className="ml-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={goalInput}
            data-editing-input={dataEditingInput}
            onChange={(e) => {
              const newValue = e.target.value
              setGoalInput(newValue)

              // Auto-resize
              const el = e.target
              el.style.height = "auto"
              el.style.height = Math.min(el.scrollHeight, 200) + "px"

              // Detect $ or @ trigger
              const cursorPos = e.target.selectionStart
              const textBeforeCursor = newValue.slice(0, cursorPos)
              const lastDollarIndex = textBeforeCursor.lastIndexOf("$")
              const lastAtIndex = textBeforeCursor.lastIndexOf("@")

              const lastTriggerIndex = Math.max(lastDollarIndex, lastAtIndex)

              if (lastTriggerIndex !== -1) {
                const triggerChar = textBeforeCursor[lastTriggerIndex]
                const query = textBeforeCursor.slice(lastTriggerIndex + 1)

                if (/\s/.test(query)) {
                  resetTrigger()
                  return
                }

                const charBeforeTrigger =
                  lastTriggerIndex > 0
                    ? textBeforeCursor[lastTriggerIndex - 1]
                    : " "

                if (/\s/.test(charBeforeTrigger)) {
                  setTriggerState({
                    active: true,
                    type: triggerChar === "$" ? "skill" : "node",
                    startIndex: lastTriggerIndex,
                    query,
                  })
                  setTriggerActiveIndex(0)
                  return
                }
              }

              resetTrigger()
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              editingMode ? "Edit your message..." : t("agent.inputPlaceholder")
            }
            className="min-h-[36px] w-full resize-none bg-transparent px-2 pt-1 text-[13px] leading-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none overflow-y-auto"
            style={{ maxHeight: "200px" }}
            autoFocus
          />
          <div className="flex items-center justify-between px-1.5 mt-1.5">
            <div className="flex items-center gap-2">
              <select
                value={aiModel}
                onChange={(e) => setAIModel(e.target.value)}
                className="h-7 text-[11px] bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer text-zinc-500 dark:text-zinc-400 appearance-none pr-4 max-w-[160px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0 center",
                }}
              >
                <option value="">Select model...</option>
                {Array.from(modelsByProvider.entries()).map(
                  ([provider, models]) => (
                    <optgroup key={provider} label={provider}>
                      {models.map((model) => (
                        <option
                          key={`${model}@${provider}`}
                          value={`${model}@${provider}`}
                        >
                          {model}
                        </option>
                      ))}
                    </optgroup>
                  )
                )}
              </select>
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
            </div>
            <div className="flex items-center gap-2 select-none">
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
                  {editingMode
                    ? "Update"
                    : isRunning
                      ? "Interrupt & Send"
                      : "Send"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
