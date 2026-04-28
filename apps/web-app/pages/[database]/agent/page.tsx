"use client"

import { useCallback, useRef, useState } from "react"
import { useChat } from "@/packages/ai"
import { DefaultChatTransport } from "ai"
import { useTranslation } from "react-i18next"

import { uuidv7 } from "@/lib/utils"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useAIFunctions } from "@/apps/web-app/hooks/use-ai-functions"
import { useAllTools } from "@/apps/web-app/hooks/use-all-tools"
import { useAgentStore } from "@/components/ai-agent/agent-store"
import { AgentHeader } from "@/components/ai-agent/agent-header"
import { AgentGoalInput } from "@/components/ai-agent/agent-goal-input"
import { AgentStatusBar } from "@/components/ai-agent/agent-status-bar"
import { AgentChatArea } from "@/components/ai-agent/agent-chat-area"

export default function AgentPage() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { getConfigByModel } = useAiConfig()
  const { handleToolsCall } = useAIFunctions()
  const allTools = useAllTools()

  useTabTitle("AI Agent")

  const {
    currentSessionId,
    setCurrentSession,
    addSession,
    isRunning,
    setIsRunning,
    setPlanSteps,
  } = useAgentStore()

  const [startTime, setStartTime] = useState(0)
  const [chatId, setChatId] = useState<string>("")
  const [stepCount, setStepCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, stop, status } = useChat({
    id: chatId,
    transport: new DefaultChatTransport({ api: "/api/agent" }),
    onToolCall: async ({ toolCall }) => {
      const res = await handleToolsCall(
        toolCall.toolName,
        (toolCall as any).input ?? (toolCall as any).args ?? {}
      )
      setStepCount((c) => c + 1)
      return res
    },
    onFinish: ({ message }) => {
      setIsRunning(false)
      if (chatId && startTime) {
        addSession({
          id: chatId,
          goal: "",
          status: "completed",
          planSteps: [],
          model: "",
          space: space ?? "",
          createdAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          maxSteps: 10,
        })
      }
    },
    onError: (error) => {
      console.error("Agent error:", error)
      setIsRunning(false)
    },
  })

  const handleSubmit = useCallback(
    (goal: string, model: string) => {
      const id = uuidv7()
      setChatId(id)
      setStartTime(Date.now())
      setStepCount(0)

      const config = getConfigByModel(model)

      setIsRunning(true)
      setCurrentSession(id)

      sendMessage(
        { text: goal },
        {
          body: {
            goal,
            model,
            id,
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
      setIsRunning,
      sendMessage,
    ]
  )

  const handleStop = useCallback(() => {
    stop()
    setIsRunning(false)
  }, [stop, setIsRunning])

  return (
    <div className="flex h-full flex-col bg-background">
      <AgentHeader />
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6">
        <div className="flex-1 overflow-auto py-4">
          {messages.length > 0 ? (
            <AgentChatArea
              messages={messages}
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
