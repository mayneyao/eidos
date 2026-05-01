"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useChat } from "@/packages/ai"
import { DefaultChatTransport } from "ai"

import { uuidv7 } from "@/lib/utils"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useAIFunctions } from "@/apps/web-app/hooks/use-ai-functions"
import { useAllTools } from "@/apps/web-app/hooks/use-all-tools"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import {
  useAgentStore,
  fetchSessions,
  fetchSession,
} from "@/components/ai-agent/agent-store"
import { AgentGoalInput } from "@/components/ai-agent/agent-goal-input"
import { AgentChatArea } from "@/components/ai-agent/agent-chat-area"

export default function AgentPage() {
  const navigate = useNavigate()
  const { space } = useCurrentPathInfo()
  const { params } = useRouterAdapter()
  const routeSessionId = params.sessionId

  useEffect(() => {
    if (!routeSessionId) {
      const newSessionId = uuidv7()
      navigate(`/agent/${newSessionId}`, { replace: true })
    }
  }, [routeSessionId, navigate])

  if (!routeSessionId) {
    return null
  }

  return (
    <div key={routeSessionId} className="h-full">
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
  const navigate = useNavigate()
  const { getConfigByModel } = useAiConfig()
  const { handleToolsCall } = useAIFunctions()
  const allTools = useAllTools()
  const { setCurrentApp } = useSidebarStore()

  useTabTitle("AI Agent")

  const {
    setSessions,
    setCurrentSession: setStoreSessionId,
    isRunning,
    setIsRunning,
    currentSessionId,
  } = useAgentStore()

  // Sync sidebar tab
  useEffect(() => {
    setCurrentApp("agent-history")
  }, [setCurrentApp])

  const [startTime, setStartTime] = useState(0)
  const [stepCount, setStepCount] = useState(0)
  const [loadedMessages, setLoadedMessages] = useState<unknown[] | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!space) return
    fetchSessions().then(setSessions)
  }, [space, setSessions])

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/agent/sessions" })
  ).current

  const { messages, sendMessage, stop, setMessages } = useChat({
    transport,
    id: routeSessionId || "new-agent-session",
    generateId: uuidv7,
    onToolCall: async ({ toolCall }) => {
      const res = await handleToolsCall(
        toolCall.toolName,
        (toolCall as any).input ?? (toolCall as any).args ?? {}
      )
      setStepCount((c) => c + 1)
      return res
    },
    onFinish: () => {
      setIsRunning(false)
      // Refresh session list
      if (space) fetchSessions().then(setSessions)
    },
    onError: (error) => {
      console.error("Agent error:", error)
      setIsRunning(false)
    },
  })

  const lastSyncedSessionId = useRef<string | null | undefined>(undefined)

  const handleSelectSession = useCallback(
    async (id: string | null) => {
      if (id === lastSyncedSessionId.current && messages.length > 0) return

      lastSyncedSessionId.current = id
      setStoreSessionId(id)

      if (id && space) {
        const data = await fetchSession(id)
        const msgs = (data?.messages ?? []) as any[]
        setLoadedMessages(msgs)
        setMessages(msgs)
      } else {
        setLoadedMessages(null)
        setMessages([])
      }
    },
    [space, messages.length, setStoreSessionId, setMessages]
  )

  // Sync route with session state
  useEffect(() => {
    const targetId = routeSessionId || null
    if (targetId !== lastSyncedSessionId.current) {
      handleSelectSession(targetId)
    }
  }, [routeSessionId, handleSelectSession])

  const handleRouteToSession = useCallback(
    async (id: string | null) => {
      const path = id ? `/agent/${id}` : `/agent`
      navigate(path)
    },
    [navigate]
  )

  const handleSubmit = useCallback(
    (goal: string, model: string) => {
      const sessionId = routeSessionId || currentSessionId || uuidv7()
      setStartTime(Date.now())
      setStepCount(0)

      if (!routeSessionId) {
        // If it's a new session, update URL
        navigate(`/agent/${sessionId}`, { replace: true })
        setStoreSessionId(sessionId)
        lastSyncedSessionId.current = sessionId
      }

      setIsRunning(true)

      const config = getConfigByModel(model)

      sendMessage(
        { text: goal },
        {
          body: {
            goal,
            model,
            id: sessionId,
            space,
            tools: allTools,
            maxSteps: 10,
            ...config,
          },
        }
      )
    },
    [
      space,
      routeSessionId,
      currentSessionId,
      getConfigByModel,
      allTools,
      setStoreSessionId,
      setIsRunning,
      sendMessage,
      navigate,
    ]
  )

  const handleStop = useCallback(() => {
    stop()
    setIsRunning(false)
  }, [stop, setIsRunning])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const elapsed = isRunning ? Date.now() - startTime : 0

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden relative">
      <div className="flex-1 relative w-full min-h-0">
        <div className="h-full overflow-auto min-h-0">
          <div className="max-w-3xl mx-auto w-full px-6 py-4 pb-64">
            {messages.length > 0 ? (
              <AgentChatArea
                messages={messages as any}
                messagesEndRef={messagesEndRef}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
                <h2 className="text-2xl font-semibold">AI Agent</h2>
                <p className="text-muted-foreground max-w-md">
                  Describe what you want the Agent to do. It will plan and
                  execute the steps autonomously using the available tools.
                </p>
              </div>
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
              maxSteps={10}
              elapsedMs={elapsed}
              onStop={handleStop}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
