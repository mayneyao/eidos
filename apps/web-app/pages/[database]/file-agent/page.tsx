import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bot, ChevronDown, FileText, Loader2, X } from "lucide-react"

import { uuidv7 } from "@/lib/utils"
import { playNotificationSound } from "@/lib/web/audio"
import {
  clearFileSpaceAgentSessionActivity,
  setFileSpaceAgentSessionActivity,
  type FileSpaceAgentSessionStatus,
} from "@/apps/web-app/components/file-space-agent/session-activity"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useDocFindInPage } from "@/apps/web-app/hooks/use-doc-find-in-page"
import { useIsActiveTab } from "@/apps/web-app/hooks/use-is-active-tab"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useTabTitle } from "@/hooks/use-tab-title"
import { AgentChatArea } from "@/components/ai-agent/agent-chat-area"
import { AgentSessionContext } from "@/components/ai-agent/agent-context"
import { AgentConversationOutline } from "@/components/ai-agent/agent-conversation-outline"
import {
  AgentGoalInput,
  type NodeMention,
} from "@/components/ai-agent/agent-goal-input"
import { useAIConfigStore } from "@/components/settings/stores"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import type {
  FileSpaceAgentApprovalMode,
  FileSpaceAgentEvent,
  FileSpaceAgentConversation,
  FileSpaceAgentMessage,
  FileSpaceAgentResourceContext,
  FileSpaceAgentRun,
  FileSpaceAgentThinkingLevel,
  FileSpaceAgentToolRun,
} from "@/apps/desktop/electron/modules/file-space-agent/types"
import { buildFileSpaceAgentMessages } from "@/apps/desktop/electron/modules/file-space-agent/file-space-agent-messages"

interface AgentTurnView {
  runId: string
  contexts: FileSpaceAgentResourceContext[]
  tools: FileSpaceAgentToolRun[]
  run?: FileSpaceAgentRun
}

function buildTurns(
  events: FileSpaceAgentEvent[],
  messages: FileSpaceAgentMessage[]
): AgentTurnView[] {
  const effectiveMessageIds = new Set(messages.map((message) => message.id))
  const effectiveRunIds = new Set<string>()
  for (const event of events) {
    if (
      event.type === "message.created" &&
      effectiveMessageIds.has(event.data.id)
    ) {
      effectiveRunIds.add(event.data.runId)
    } else if (
      event.type === "message.snapshot" &&
      event.data.runId &&
      effectiveMessageIds.has(event.data.message.id)
    ) {
      effectiveRunIds.add(event.data.runId)
    }
  }
  const turns = new Map<string, AgentTurnView>()
  const order: string[] = []
  for (const event of events) {
    if (
      event.type === "conversation.created" ||
      event.type === "message.snapshot" ||
      event.type === "conversation.truncated"
    ) {
      continue
    }
    const runId =
      event.type === "run.status"
        ? event.data.run.id
        : event.type === "tool.status"
          ? event.data.tool.runId
          : event.data.runId
    if (effectiveRunIds.size > 0 && !effectiveRunIds.has(runId)) continue
    const turn = turns.get(runId) ?? {
      runId,
      contexts: [],
      tools: [],
    }
    if (!turns.has(runId)) order.push(runId)
    if (event.type === "resource.context") {
      turn.contexts.push(event.data.context)
    } else if (event.type === "run.status") {
      turn.run = event.data.run
    } else if (event.type === "tool.status") {
      const existing = turn.tools.findIndex(
        (tool) => tool.id === event.data.tool.id
      )
      if (existing >= 0) turn.tools[existing] = event.data.tool
      else turn.tools.push(event.data.tool)
    }
    turns.set(runId, turn)
  }
  return order.map((runId) => turns.get(runId)!).filter(Boolean)
}

function buildToolRunsByCallId(
  events: FileSpaceAgentEvent[]
): Map<string, FileSpaceAgentToolRun> {
  const runs = new Map<string, FileSpaceAgentToolRun>()
  for (const event of events) {
    if (event.type === "tool.status" && event.data.tool.toolCallId) {
      runs.set(event.data.tool.toolCallId, event.data.tool)
    }
  }
  return runs
}

function messageText(message: FileSpaceAgentMessage | undefined): string {
  if (!message) return ""
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
}

function ExecutionDetails({ turns }: { turns: AgentTurnView[] }) {
  const visible = turns.filter(
    (turn) => turn.contexts.length > 0 || turn.run?.error
  )
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 py-2">
      {visible.map((turn) => (
        <div key={turn.runId} className="space-y-2">
          {turn.contexts.map((context) => (
            <details
              key={`${turn.runId}:${context.path}:${context.capturedAt}`}
              className="rounded-lg border bg-muted/20 text-xs"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{context.path}</span>
                <span>
                  {context.reason === "selection" ? "Selection" : "Active tab"}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="border-t px-3 py-2">
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {context.heading ? (
                    <span>Heading: {context.heading}</span>
                  ) : null}
                  {context.tableId ? (
                    <span>Table: {context.tableId}</span>
                  ) : null}
                  {context.rowId ? <span>Record: {context.rowId}</span> : null}
                  {context.contentDigest ? (
                    <span>Digest: {context.contentDigest.slice(0, 12)}…</span>
                  ) : null}
                  {context.baseFingerprint ? (
                    <span>Base revision: {context.baseFingerprint}</span>
                  ) : null}
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px] leading-5">
                  {context.selection ?? context.excerpt}
                </pre>
              </div>
            </details>
          ))}

          {turn.run?.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {turn.run.error}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function FileSpaceAgentPage() {
  const { currentSpace } = useCurrentSpace()
  const { params, location, navigate } = useRouterAdapter()
  const conversationId = params.conversationId
  const sourceState = (location.state ?? {}) as {
    sourceUrl?: string
    selection?: string
  }
  const { aiConfig } = useAIConfigStore()
  const { aiModel, setAIModel } = useAppStore()
  const [events, setEvents] = useState<FileSpaceAgentEvent[]>([])
  const [conversation, setConversation] =
    useState<FileSpaceAgentConversation | null>(null)
  const [messages, setMessages] = useState<FileSpaceAgentMessage[]>([])
  const [activeRun, setActiveRun] = useState<FileSpaceAgentRun | null>(null)
  const [goalInput, setGoalInput] = useState("")
  const [approvalMode, setApprovalMode] =
    useState<FileSpaceAgentApprovalMode>("ask")
  const [thinkingLevel, setThinkingLevel] =
    useState<FileSpaceAgentThinkingLevel>("off")
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [isAllExpanded, setIsAllExpanded] = useState<boolean | undefined>()
  const [requestError, setRequestError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState("")
  const latestSequenceRef = useRef(0)
  const pollInFlightRef = useRef(false)
  const restoredPreferencesRef = useRef(false)
  const initialPollCompleteRef = useRef(false)
  const seenSucceededRunsRef = useRef(new Set<string>())
  const isActiveTab = useIsActiveTab()

  useDocFindInPage("agent")

  const modelOptions = useMemo(
    () =>
      aiConfig.llmProviders
        .filter((provider) => provider.enabled !== false)
        .flatMap((provider) =>
          provider.models
            .split(",")
            .map((model) => model.trim())
            .filter(Boolean)
            .map((model) => `${model}@${provider.name}`)
        ),
    [aiConfig.llmProviders]
  )
  const selectedModel = modelOptions.includes(aiModel)
    ? aiModel
    : (modelOptions[0] ?? "")
  const isRunning =
    activeRun?.status === "queued" ||
    activeRun?.status === "running" ||
    activeRun?.status === "waiting-approval"

  useEffect(() => {
    if (!conversationId) return
    const activeStatus = activeRun?.status
    const status: FileSpaceAgentSessionStatus =
      activeStatus === "queued" ||
      activeStatus === "running" ||
      activeStatus === "waiting-approval"
        ? activeStatus
        : requestError || activeStatus === "failed"
          ? "failed"
          : "idle"
    setFileSpaceAgentSessionActivity(conversationId, { status })
  }, [activeRun?.status, conversationId, requestError])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActiveTab) return
      const modifierPressed = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
        ? event.metaKey && event.altKey
        : event.ctrlKey && event.altKey
      if (
        modifierPressed &&
        (event.code === "KeyT" || event.key.toLowerCase() === "t")
      ) {
        event.preventDefault()
        setIsAllExpanded((expanded) => !expanded)
      }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isActiveTab])

  useEffect(() => {
    const selectSkill = (event: Event) => {
      const detail = (event as CustomEvent<{ dirName?: string }>).detail
      if (!detail?.dirName) return
      setGoalInput(`$${detail.dirName} `)
      setSelectedSkills((current) =>
        current.includes(detail.dirName!)
          ? current
          : [...current, detail.dirName!]
      )
    }
    window.addEventListener("agent:try-skill", selectSkill)
    return () => window.removeEventListener("agent:try-skill", selectSkill)
  }, [])

  useEffect(
    () => () => {
      if (conversationId) clearFileSpaceAgentSessionActivity(conversationId)
    },
    [conversationId]
  )

  useEffect(() => {
    if (!conversationId) {
      navigate(`/agent/${uuidv7()}`, {
        replace: true,
        state: location.state,
      })
    }
  }, [conversationId, location.state, navigate])

  useEffect(() => {
    if (selectedModel && selectedModel !== aiModel) setAIModel(selectedModel)
  }, [aiModel, selectedModel, setAIModel])

  const poll = useCallback(async () => {
    if (
      !currentSpace?.id ||
      !conversationId ||
      !window.eidos?.fileSpaceAgent ||
      pollInFlightRef.current
    ) {
      return
    }
    pollInFlightRef.current = true
    try {
      const snapshot = await window.eidos.fileSpaceAgent.getConversation(
        currentSpace.id,
        conversationId,
        latestSequenceRef.current
      )
      const succeededRunIds = snapshot.events.flatMap((event) =>
        event.type === "run.status" && event.data.run.status === "succeeded"
          ? [event.data.run.id]
          : []
      )
      const shouldNotify =
        initialPollCompleteRef.current &&
        succeededRunIds.some(
          (runId) => !seenSucceededRunsRef.current.has(runId)
        )
      succeededRunIds.forEach((runId) =>
        seenSucceededRunsRef.current.add(runId)
      )
      if (shouldNotify && aiConfig.agentNotificationSound !== false) {
        void playNotificationSound().catch(console.error)
      }
      if (snapshot.events.length > 0) {
        latestSequenceRef.current = snapshot.events.at(-1)!.sequence
        setEvents((current) => {
          const combined = [...current, ...snapshot.events]
          if (!snapshot.messages) {
            setMessages(buildFileSpaceAgentMessages(combined))
          }
          return combined
        })
      }
      if (snapshot.messages) setMessages(snapshot.messages)
      setConversation(snapshot.conversation)
      setActiveRun(snapshot.activeRun)
      initialPollCompleteRef.current = true
      if (snapshot.conversation && !restoredPreferencesRef.current) {
        restoredPreferencesRef.current = true
        setApprovalMode(snapshot.approvalMode)
        setThinkingLevel(snapshot.conversation.thinking ?? "off")
        setSelectedSkills(snapshot.conversation.skills ?? [])
      }
      setRequestError(null)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
      pollInFlightRef.current = false
    }
  }, [aiConfig.agentNotificationSound, conversationId, currentSpace?.id])

  useEffect(() => {
    latestSequenceRef.current = 0
    setEvents([])
    setMessages([])
    setConversation(null)
    setActiveRun(null)
    restoredPreferencesRef.current = false
    initialPollCompleteRef.current = false
    seenSucceededRunsRef.current.clear()
    setLoading(true)
    void poll()
    const interval = window.setInterval(() => void poll(), 350)
    return () => window.clearInterval(interval)
  }, [poll])

  const turns = useMemo(() => buildTurns(events, messages), [events, messages])
  const toolRunsByCallId = useMemo(
    () => buildToolRunsByCallId(events),
    [events]
  )
  const title = messageText(messages.find((message) => message.role === "user"))
  useTabTitle(
    title ? (title.length > 60 ? `${title.slice(0, 57)}…` : title) : "Agent"
  )

  const submit = useCallback(
    async (text: string, model: string, mentions?: NodeMention[]) => {
      if (
        !text.trim() ||
        !model ||
        !currentSpace?.id ||
        !conversationId ||
        isRunning
      ) {
        return
      }
      setSending(true)
      setRequestError(null)
      try {
        await window.eidos.fileSpaceAgent.startRun({
          spaceId: currentSpace.id,
          conversationId,
          prompt: text.trim(),
          model,
          thinking: thinkingLevel,
          skills: selectedSkills,
          mentions,
          context: {
            sourceUrl: sourceState.sourceUrl,
            selection: sourceState.selection,
          },
        })
        setSelectedSkills([])
        await poll()
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : String(error))
      } finally {
        setSending(false)
      }
    },
    [
      conversationId,
      currentSpace?.id,
      isRunning,
      poll,
      selectedSkills,
      sourceState.selection,
      sourceState.sourceUrl,
      thinkingLevel,
    ]
  )

  const stop = useCallback(async () => {
    if (!activeRun || !currentSpace?.id || !conversationId) return
    await window.eidos.fileSpaceAgent.stopRun(
      currentSpace.id,
      conversationId,
      activeRun.id
    )
    await poll()
  }, [activeRun, conversationId, currentSpace?.id, poll])

  const changeApprovalMode = useCallback(
    async (mode: FileSpaceAgentApprovalMode) => {
      if (!currentSpace?.id || !conversationId) return
      const previous = approvalMode
      setApprovalMode(mode)
      setRequestError(null)
      try {
        await window.eidos.fileSpaceAgent.setApprovalMode(
          currentSpace.id,
          conversationId,
          mode
        )
      } catch (error) {
        setApprovalMode(previous)
        setRequestError(error instanceof Error ? error.message : String(error))
      }
    },
    [approvalMode, conversationId, currentSpace?.id]
  )

  const decide = useCallback(
    async (
      runId: string,
      toolRunId: string,
      decision: "allow-once" | "deny"
    ) => {
      if (!currentSpace?.id || !conversationId) return
      await window.eidos.fileSpaceAgent.decideToolRun(
        currentSpace.id,
        conversationId,
        runId,
        toolRunId,
        decision
      )
      await poll()
    },
    [conversationId, currentSpace?.id, poll]
  )

  const displayMessages = useMemo<FileSpaceAgentMessage[]>(
    () =>
      messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) => {
          const toolCallId =
            typeof part.toolCallId === "string" ? part.toolCallId : undefined
          const audit = toolCallId
            ? toolRunsByCallId.get(toolCallId)
            : undefined
          if (!audit) return part
          return {
            ...part,
            audit,
            onAuditDecision: (decision: "allow-once" | "deny") =>
              void decide(audit.runId, audit.id, decision),
          }
        }),
      })),
    [decide, messages, toolRunsByCallId]
  )

  const fork = useCallback(
    async (messageId: string) => {
      if (!currentSpace?.id || !conversationId) return
      const newId = uuidv7()
      try {
        await window.eidos.fileSpaceAgent.forkConversation(
          currentSpace.id,
          conversationId,
          messageId,
          newId
        )
        navigate(`/agent/${newId}`)
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : String(error))
      }
    },
    [conversationId, currentSpace?.id, navigate]
  )

  const retry = useCallback(
    async (messageId: string) => {
      if (!currentSpace?.id || !conversationId || !selectedModel || isRunning)
        return
      const targetIndex = messages.findIndex(
        (message) => message.id === messageId
      )
      const previousUser = [...messages.slice(0, targetIndex)]
        .reverse()
        .find((message) => message.role === "user")
      const prompt = messageText(previousUser)
      if (!prompt) return
      setSending(true)
      try {
        await window.eidos.fileSpaceAgent.startRun({
          spaceId: currentSpace.id,
          conversationId,
          prompt,
          model: selectedModel,
          thinking: thinkingLevel,
          skills: selectedSkills,
          regenerateFromMessageId: messageId,
          context: {
            sourceUrl: sourceState.sourceUrl,
            selection: sourceState.selection,
          },
        })
        await poll()
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : String(error))
      } finally {
        setSending(false)
      }
    },
    [
      conversationId,
      currentSpace?.id,
      isRunning,
      messages,
      poll,
      selectedModel,
      selectedSkills,
      sourceState.selection,
      sourceState.sourceUrl,
      thinkingLevel,
    ]
  )

  const startEditing = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditingContent(content)
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent("")
    setGoalInput("")
  }, [])

  const submitEdit = useCallback(
    async (text: string, model: string) => {
      if (!currentSpace?.id || !conversationId || !editingMessageId) return
      setSending(true)
      setRequestError(null)
      try {
        await window.eidos.fileSpaceAgent.replaceMessage(
          currentSpace.id,
          conversationId,
          editingMessageId,
          text,
          model
        )
        await window.eidos.fileSpaceAgent.startRun({
          spaceId: currentSpace.id,
          conversationId,
          prompt: text,
          model,
          thinking: thinkingLevel,
          skills: selectedSkills,
          regenerateFromMessageId: editingMessageId,
          context: {
            sourceUrl: sourceState.sourceUrl,
            selection: sourceState.selection,
          },
        })
        setEditingMessageId(null)
        setEditingContent("")
        setGoalInput("")
        await poll()
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : String(error))
      } finally {
        setSending(false)
      }
    },
    [
      conversationId,
      currentSpace?.id,
      editingMessageId,
      poll,
      selectedSkills,
      sourceState.selection,
      sourceState.sourceUrl,
      thinkingLevel,
    ]
  )

  const contextValue = useMemo(
    () => ({
      sessionId: conversationId ?? "",
      isRunning,
      setIsRunning: () => {},
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
      conversationId,
      goalInput,
      isAllExpanded,
      isRunning,
      selectedSkills,
      thinkingLevel,
    ]
  )

  if (!window.eidos?.fileSpaceAgent) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        File Space Agent is available in the Desktop app.
      </div>
    )
  }

  return (
    <AgentSessionContext.Provider value={contextValue}>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
        <div className="min-h-0 flex-1">
          <MessageScrollerProvider
            key={conversationId}
            autoScroll
            defaultScrollPosition="last-anchor"
            scrollPreviousItemPeek={96}
            scrollMargin={24}
          >
            <MessageScroller className="h-full">
              <AgentConversationOutline messages={messages as any} />
              <MessageScrollerViewport
                id="agent-chat-scroll-container"
                aria-label="Agent conversation"
              >
                <MessageScrollerContent
                  aria-busy={isRunning}
                  className="mx-auto w-full max-w-3xl gap-2 px-6 py-4 pb-64"
                >
                  {loading && messages.length === 0 ? (
                    <MessageScrollerItem className="flex min-h-[400px] items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Restoring conversation…
                    </MessageScrollerItem>
                  ) : messages.length > 0 ? (
                    <>
                      <AgentChatArea
                        messages={displayMessages as any}
                        onFork={fork}
                        onRetry={retry}
                        onEditStart={startEditing}
                        parentId={conversation?.parentId}
                        forkedMessageId={conversation?.forkedMessageId}
                        isRunning={isRunning}
                        error={requestError ? new Error(requestError) : null}
                      />
                      <MessageScrollerItem messageId="agent-execution-details">
                        <ExecutionDetails turns={turns} />
                      </MessageScrollerItem>
                    </>
                  ) : (
                    <MessageScrollerItem className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
                      <div className="rounded-full border bg-muted/40 p-3">
                        <Bot className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h1 className="text-xl font-semibold">
                          Ask about this Space
                        </h1>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                          Agent can use Skills and typed Space, Base, Extension,
                          and version tools. Every action stays scoped to this
                          Space and follows the approval mode below.
                        </p>
                      </div>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton className="data-[direction=end]:bottom-40 sm:data-[direction=end]:bottom-44" />
            </MessageScroller>
          </MessageScrollerProvider>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-6 sm:p-10">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl space-y-2">
              {requestError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {requestError}
                </div>
              ) : null}
              {editingMessageId ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-sidebar px-3 py-2 text-sm">
                  <span className="font-medium text-primary">
                    Editing message…
                  </span>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded p-1 hover:bg-primary/10"
                    title="Cancel editing"
                  >
                    <X className="h-4 w-4 text-primary" />
                  </button>
                </div>
              ) : null}
              <AgentGoalInput
                onSubmit={editingMessageId ? submitEdit : submit}
                isRunning={isRunning || sending}
                onStop={() => void stop()}
                selectedSkills={selectedSkills}
                onSelectedSkillsChange={setSelectedSkills}
                approvalMode={approvalMode}
                onApprovalModeChange={(mode) => void changeApprovalMode(mode)}
                initialValue={editingContent}
                editingMode={!!editingMessageId}
                data-editing-input="true"
              />
            </div>
          </div>
        </div>
      </div>
    </AgentSessionContext.Provider>
  )
}
