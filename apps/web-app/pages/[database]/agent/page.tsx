"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "@/packages/ai"
import { DefaultChatTransport } from "ai"

import { uuidv7 } from "@/lib/utils"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useAIFunctions } from "@/apps/web-app/hooks/use-ai-functions"
import { useAllTools } from "@/apps/web-app/hooks/use-all-tools"
import {
  useAgentStore,
  fetchSessions,
  fetchSession,
  type AgentSession,
} from "@/components/ai-agent/agent-store"
import { AgentHeader } from "@/components/ai-agent/agent-header"
import { AgentGoalInput } from "@/components/ai-agent/agent-goal-input"
import { AgentStatusBar } from "@/components/ai-agent/agent-status-bar"
import { AgentChatArea } from "@/components/ai-agent/agent-chat-area"

export default function AgentPage() {
  const { space } = useCurrentPathInfo()
  const { getConfigByModel } = useAiConfig()
  const { handleToolsCall } = useAIFunctions()
  const allTools = useAllTools()

  useTabTitle("AI Agent")

  const {
    currentSessionId,
    setSessions,
    setCurrentSession,
    addActiveSession,
    updateSessionMessages,
    isRunning,
    setIsRunning,
  } = useAgentStore()

  const [startTime, setStartTime] = useState(0)
  const [stepCount, setStepCount] = useState(0)
  const [loadedSession, setLoadedSession] = useState<AgentSession | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load sessions from API on mount
  useEffect(() => {
    if (!space) return
    fetchSessions(space).then(setSessions)
  }, [space, setSessions])

  const transport = useRef(
    new DefaultChatTransport({ api: "/api/agent" })
  ).current

  const { messages, sendMessage, stop } = useChat({
    transport,
    generateId: uuidv7,
    onToolCall: async ({ toolCall }) => {
      const res = await handleToolsCall(
        toolCall.toolName,
        (toolCall as any).input ?? (toolCall as any).args ?? {}
      )
      setStepCount((c) => c + 1)
      return res
    },
    onFinish: ({ message }: { message: any }) => {
      setIsRunning(false)
      const sessionId = currentSessionId
      if (!sessionId) return
      const assistantText =
        message?.parts
          ?.filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("") ?? ""
      const stored = messages.map((m) => ({
        id: m.id,
        role: m.role,
        text:
          (m as any).parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("") ?? "",
      }))
      if (assistantText) {
        stored.push({
          id: message.id ?? uuidv7(),
          role: "assistant",
          text: assistantText,
        })
      }
      updateSessionMessages(sessionId, stored, "completed")
      // Refresh session list from API
      if (space) fetchSessions(space).then(setSessions)
    },
    onError: (error) => {
      console.error("Agent error:", error)
      setIsRunning(false)
    },
  })

  const handleSelectSession = useCallback(
    async (id: string | null) => {
      setCurrentSession(id)
      if (id && space) {
        const session = await fetchSession(space, id)
        setLoadedSession(session)
      } else {
        setLoadedSession(null)
      }
    },
    [space, setCurrentSession]
  )

  const handleSubmit = useCallback(
    (goal: string, model: string) => {
      const sessionId = uuidv7()
      setStartTime(Date.now())
      setStepCount(0)
      setLoadedSession(null)
      setIsRunning(true)

      const config = getConfigByModel(model)

      addActiveSession({
        id: sessionId,
        goal,
        status: "executing",
        planSteps: [],
        messages: [],
        model,
        space: space ?? "",
        createdAt: new Date().toISOString(),
        maxSteps: 10,
      })
      setCurrentSession(sessionId)

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
      getConfigByModel,
      allTools,
      setCurrentSession,
      addActiveSession,
      setIsRunning,
      sendMessage,
    ]
  )

  const handleStop = useCallback(() => {
    stop()
    setIsRunning(false)
  }, [stop, setIsRunning])

  // Determine what to show
  const pastMessages = loadedSession?.messages ?? []
  const showMessages =
    messages.length > 0
      ? messages
      : pastMessages.length > 0
        ? (pastMessages as any)
        : []

  return (
    <div className="flex h-full flex-col bg-background">
      <AgentHeader onSelectSession={handleSelectSession} />
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6">
        <div className="flex-1 overflow-auto py-4">
          {showMessages.length > 0 ? (
            <AgentChatArea
              messages={showMessages}
              messagesEndRef={messagesEndRef}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <h2 className="text-2xl font-semibold">AI Agent</h2>
              <p className="text-muted-foreground max-w-md">
                Describe what you want the Agent to do. It will plan and execute
                the steps autonomously using the available tools.
              </p>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 py-4 bg-background">
          <AgentGoalInput onSubmit={handleSubmit} isRunning={isRunning} />
        </div>
      </div>
      <AgentStatusBar
        isRunning={isRunning}
        stepCount={stepCount}
        maxSteps={10}
        elapsedMs={startTime ? Date.now() - startTime : 0}
        onStop={handleStop}
      />
    </div>
  )
}
