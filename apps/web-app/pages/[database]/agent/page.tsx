"use client"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useChat } from "@/packages/ai"
import { DefaultChatTransport } from "ai"

import { uuidv7 } from "@/lib/utils"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useIsActiveTab } from "@/apps/web-app/hooks/use-is-active-tab"
import { useDocFindInPage } from "@/apps/web-app/hooks/use-doc-find-in-page"
import { type AgentSession } from "@/packages/core/agent-session/agent-session-store"

import { AgentGoalInput } from "@/components/ai-agent/agent-goal-input"
import { AgentChatArea } from "@/components/ai-agent/agent-chat-area"
import { AgentSessionContext } from "@/components/ai-agent/agent-context"

export default function AgentPage() {
  const { space } = useCurrentPathInfo()
  const { params, navigate } = useRouterAdapter()
  const routeSessionId = params.sessionId

  useEffect(() => {
    if (!routeSessionId) {
      const newSessionId = uuidv7()
      console.log(
        "[AgentPage] No routeSessionId, redirecting to new session:",
        newSessionId
      )
      navigate(`/agent/${newSessionId}`, { replace: true })
    }
  }, [routeSessionId, navigate])

  if (!routeSessionId) {
    return null
  }

  return (
    <div className="h-full">
      <AgentPageContent space={space} routeSessionId={routeSessionId} />
    </div>
  )
}

function AgentPageContent({
  space,
  routeSessionId,
}: {
  space: string
  routeSessionId: string | undefined
}) {
  const { navigate } = useRouterAdapter()
  const { setCurrentApp } = useSidebarStore()

  console.log("[AgentPageContent] Render:", { space, routeSessionId })
  const [goalInput, setGoalInput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [isAllExpanded, setIsAllExpanded] = useState<boolean | undefined>(
    undefined
  )
  const [thinkingLevel, setThinkingLevel] = useState<
    "off" | "low" | "medium" | "high"
  >("off")
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [forkInfo, setForkInfo] = useState<{
    parentId?: string
    forkedMessageId?: string
  } | null>(null)
  const [displayMessages, setDisplayMessages] = useState<any[]>([])
  const [isSwitching, setIsSwitching] = useState(false)

  const contextValue = useMemo(
    () => ({
      sessionId: routeSessionId || "",
      isRunning,
      setIsRunning,
      goalInput,
      setGoalInput,
      isAllExpanded,
      setIsAllExpanded,
      thinkingLevel,
      setThinkingLevel,
      selectedSkills,
      setSelectedSkills,
    }),
    [
      routeSessionId,
      isRunning,
      goalInput,
      isAllExpanded,
      thinkingLevel,
      selectedSkills,
    ]
  )

  useDocFindInPage("agent")

  const isActiveTab = useIsActiveTab()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActiveTab) return

      const isMac =
        typeof window !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
      const modifierPressed = isMac
        ? e.metaKey && e.altKey
        : e.ctrlKey && e.altKey

      if (
        modifierPressed &&
        (e.code === "KeyT" || e.key.toLowerCase() === "t")
      ) {
        e.preventDefault()
        setIsAllExpanded((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isActiveTab])

  // Sync sidebar tab
  useEffect(() => {
    setCurrentApp("agent")
  }, [setCurrentApp])

  // Listen for "Try in Chat" from sidebar skills panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.dirName) return
      setGoalInput(`$${detail.dirName} `)
      setSelectedSkills((prev) =>
        prev.includes(detail.dirName) ? prev : [...prev, detail.dirName]
      )
    }
    window.addEventListener("agent:try-skill", handler)
    return () => window.removeEventListener("agent:try-skill", handler)
  }, [])

  const [startTime, setStartTime] = useState(0)
  const [stepCount, setStepCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/agent/sessions" })
  ).current

  const { messages, sendMessage, stop, setMessages } = useChat({
    transport,
    id: routeSessionId || "new-agent-session",
    generateId: uuidv7,
    onToolCall: async () => {
      setStepCount((c) => c + 1)
    },
    onFinish: () => {
      setIsRunning(false)
    },
    onError: (error) => {
      console.error("Agent error:", error)
      setIsRunning(false)
    },
  })

  // Abort the stream when the component unmounts (e.g. tab closed or navigated away)
  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  const firstUserMessage = messages.find((m) => m.role === "user")
  const goalText = firstUserMessage
    ? (firstUserMessage as any).content ||
      (
        (firstUserMessage.parts ?? []).find(
          (p: any) => p.type === "text"
        ) as any
      )?.text ||
      ""
    : ""

  useTabTitle(goalText ? goalText : "AI Agent")

  const sessionLoadIdRef = useRef(0)

  // 1. Sync displayMessages with useChat messages while streaming/active
  useEffect(() => {
    if (!isSwitching) {
      setDisplayMessages(messages)
    }
  }, [messages, isSwitching])

  // 2. Handle session switching and initial data loading
  useEffect(() => {
    console.log(
      "[AgentPageContent] Syncing session messages for routeSessionId:",
      routeSessionId
    )
    const targetId = routeSessionId || null
    const loadId = ++sessionLoadIdRef.current
    let cancelled = false

    if (!targetId || !space) {
      setMessages([])
      setDisplayMessages([])
      setForkInfo(null)
      return () => {
        cancelled = true
      }
    }

    setIsSwitching(true)

    fetchSession(targetId)
      .then((data) => {
        if (cancelled || loadId !== sessionLoadIdRef.current) return

        const newMessages = (data?.messages ?? []) as any
        setMessages(newMessages)
        setDisplayMessages(newMessages)
        setIsSwitching(false)

        if (data?.parentId) {
          setForkInfo({
            parentId: data.parentId,
            forkedMessageId: data.forkedMessageId,
          })
        }
      })
      .catch(() => {
        if (cancelled || loadId !== sessionLoadIdRef.current) return
        setMessages([])
        setDisplayMessages([])
        setIsSwitching(false)
      })

    return () => {
      cancelled = true
    }
  }, [routeSessionId, space, setMessages])

  const handleSubmit = useCallback(
    (goal: string, model: string) => {
      const sessionId = routeSessionId || uuidv7()
      console.log("[AgentPageContent] handleSubmit called", {
        goal,
        model,
        routeSessionId,
        newSessionId: sessionId,
      })
      setStartTime(Date.now())
      setStepCount(0)

      if (isRunning) {
        stop()
      }

      if (!routeSessionId) {
        // If it's a new session, update URL
        navigate(`/agent/${sessionId}`, { replace: true })
      }

      setIsRunning(true)

      const proceed = () => {
        sendMessage(
          { text: goal },
          {
            body: {
              goal,
              model,
              id: sessionId,
              space,
              maxSteps: 100,
              thinking: thinkingLevel,
              skills: selectedSkills,
            },
          }
        )
        setSelectedSkills([])
      }

      if (isRunning) {
        setTimeout(proceed, 50)
      } else {
        proceed()
      }
    },
    [
      space,
      routeSessionId,
      sendMessage,
      navigate,
      isRunning,
      stop,
      thinkingLevel,
      selectedSkills,
    ]
  )

  const handleStop = useCallback(async () => {
    stop()
    setIsRunning(false)
    // Note: partial session state is saved server-side via onFinish when
    // the stream completes. A mid-stream stop may result in an incomplete
    // session — acceptable for now.
  }, [stop])

  const handleFork = useCallback(
    async (messageId: string) => {
      if (!routeSessionId) return
      const newId = await forkSession(routeSessionId, messageId)
      if (newId) {
        navigate(`/agent/${newId}`)
      }
    },
    [routeSessionId, navigate]
  )

  const elapsed = isRunning ? Date.now() - startTime : 0

  return (
    <AgentSessionContext.Provider value={contextValue}>
      <div className="flex h-full flex-col bg-background overflow-hidden relative">
        <div className="flex-1 relative w-full min-h-0">
          <div
            id="agent-chat-scroll-container"
            className="h-full overflow-auto min-h-0 focus:outline-none"
            tabIndex={-1}
          >
            <div className="max-w-3xl mx-auto w-full px-6 py-4 pb-64">
              {displayMessages.length > 0 ? (
                <AgentChatArea
                  messages={displayMessages as any}
                  messagesEndRef={messagesEndRef}
                  onFork={handleFork}
                  parentId={forkInfo?.parentId}
                  forkedMessageId={forkInfo?.forkedMessageId}
                />
              ) : (
                !isSwitching && (
                  <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
                    <h2 className="text-2xl font-semibold">AI Agent</h2>
                    <p className="text-muted-foreground max-w-md">
                      Describe what you want the Agent to do. It will plan and
                      execute the steps autonomously using the available tools.
                    </p>
                  </div>
                )
              )}
              <div className="h-4" />
            </div>
          </div>

          {/* Floating Input Component */}
          <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none p-6 sm:p-10">
            <div className="max-w-3xl mx-auto w-full pointer-events-auto">
              <AgentGoalInput
                onSubmit={handleSubmit}
                isRunning={isRunning}
                stepCount={stepCount}
                maxSteps={100}
                elapsedMs={elapsed}
                onStop={handleStop}
                selectedSkills={selectedSkills}
                onSelectedSkillsChange={setSelectedSkills}
              />
            </div>
          </div>
        </div>
      </div>
    </AgentSessionContext.Provider>
  )
}

async function fetchSession(
  id: string
): Promise<(AgentSession & { messages: any[] }) | null> {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`)
  if (!res.ok) return null
  return res.json()
}

async function forkSession(
  sourceId: string,
  messageId: string
): Promise<string | null> {
  const res = await fetch(
    `/api/agent/sessions/${encodeURIComponent(sourceId)}/fork`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.id ?? null
}
