import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  Check,
  ChevronDown,
  CircleStop,
  FileText,
  Loader2,
  Plus,
  Search,
  Send,
  ShieldAlert,
  X,
} from "lucide-react"

import { uuidv7 } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useAIConfigStore } from "@/components/settings/stores"
import { Button } from "@/components/ui/button"
import type {
  FileSpaceAgentEvent,
  FileSpaceAgentResourceContext,
  FileSpaceAgentRun,
  FileSpaceAgentToolRun,
} from "@/apps/desktop/electron/modules/file-space-agent/types"

interface AgentTurnView {
  runId: string
  userText: string
  assistantText: string
  contexts: FileSpaceAgentResourceContext[]
  tools: FileSpaceAgentToolRun[]
  run?: FileSpaceAgentRun
}

function buildTurns(events: FileSpaceAgentEvent[]): AgentTurnView[] {
  const turns = new Map<string, AgentTurnView>()
  const order: string[] = []
  for (const event of events) {
    if (event.type === "conversation.created") continue
    const runId =
      event.type === "run.status"
        ? event.data.run.id
        : event.type === "tool.status"
          ? event.data.tool.runId
          : event.data.runId
    if (event.type === "message.created") {
      if (!turns.has(runId)) order.push(runId)
      turns.set(runId, {
        runId,
        userText: event.data.text,
        assistantText: turns.get(runId)?.assistantText ?? "",
        contexts: turns.get(runId)?.contexts ?? [],
        tools: turns.get(runId)?.tools ?? [],
        run: turns.get(runId)?.run,
      })
      continue
    }
    const turn: AgentTurnView = turns.get(runId) ?? {
      runId,
      userText: "",
      assistantText: "",
      contexts: [],
      tools: [],
    }
    if (!turns.has(runId)) order.push(runId)
    if (event.type === "assistant.delta") {
      turn.assistantText += event.data.text
    } else if (event.type === "resource.context") {
      turn.contexts.push(event.data.context)
    } else if (event.type === "run.status") {
      turn.run = event.data.run
    } else if (event.type === "tool.status") {
      const existing = turn.tools.findIndex(
        (tool) => tool.id === event.data.tool.id
      )
      if (existing >= 0) turn.tools[existing] = event.data.tool
      else {
        turn.tools.push(event.data.tool)
      }
    }
    turns.set(runId, turn)
  }
  return order.map((runId) => turns.get(runId)!).filter(Boolean)
}

function statusTone(status: string): string {
  if (status === "failed" || status === "denied") {
    return "border-destructive/30 bg-destructive/5 text-destructive"
  }
  if (status === "succeeded" || status === "approved") {
    return "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
  }
  if (status === "waiting-approval") {
    return "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200"
  }
  return "border-border bg-muted/30 text-muted-foreground"
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
  const [activeRun, setActiveRun] = useState<FileSpaceAgentRun | null>(null)
  const [prompt, setPrompt] = useState("")
  const [requestError, setRequestError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const latestSequenceRef = useRef(0)
  const pollInFlightRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const modelOptions = useMemo(
    () =>
      aiConfig.llmProviders
        .filter((provider) => provider.enabled !== false)
        .flatMap((provider) =>
          provider.models
            .split(",")
            .map((model) => model.trim())
            .filter(Boolean)
            .map((model) => ({
              value: `${model}@${provider.name}`,
              label: model,
              provider: provider.name,
            }))
        ),
    [aiConfig.llmProviders]
  )

  const selectedModel = modelOptions.some((option) => option.value === aiModel)
    ? aiModel
    : (modelOptions[0]?.value ?? "")

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
      if (snapshot.events.length > 0) {
        latestSequenceRef.current = snapshot.events.at(-1)!.sequence
        setEvents((current) => [...current, ...snapshot.events])
      }
      setActiveRun(snapshot.activeRun)
      setRequestError(null)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
      pollInFlightRef.current = false
    }
  }, [conversationId, currentSpace?.id])

  useEffect(() => {
    latestSequenceRef.current = 0
    setEvents([])
    setActiveRun(null)
    setLoading(true)
    void poll()
    const interval = window.setInterval(() => void poll(), 350)
    return () => window.clearInterval(interval)
  }, [poll])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
    } else {
      element.scrollTop = element.scrollHeight
    }
  }, [events.length])

  const turns = useMemo(() => buildTurns(events), [events])
  const title = turns[0]?.userText || "Agent"
  useTabTitle(title.length > 60 ? `${title.slice(0, 57)}…` : title)

  const submit = useCallback(async () => {
    const text = prompt.trim()
    if (
      !text ||
      !selectedModel ||
      !currentSpace?.id ||
      !conversationId ||
      activeRun
    ) {
      return
    }
    setSending(true)
    setRequestError(null)
    try {
      await window.eidos.fileSpaceAgent.startRun({
        spaceId: currentSpace.id,
        conversationId,
        prompt: text,
        model: selectedModel,
        context: {
          sourceUrl: sourceState.sourceUrl,
          selection: sourceState.selection,
        },
      })
      setPrompt("")
      await poll()
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }, [
    activeRun,
    conversationId,
    currentSpace?.id,
    poll,
    prompt,
    selectedModel,
    sourceState.selection,
    sourceState.sourceUrl,
  ])

  const stop = useCallback(async () => {
    if (!activeRun || !currentSpace?.id || !conversationId) return
    await window.eidos.fileSpaceAgent.stopRun(
      currentSpace.id,
      conversationId,
      activeRun.id
    )
    await poll()
  }, [activeRun, conversationId, currentSpace?.id, poll])

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

  const newConversation = useCallback(() => {
    useTabStore.getState().openTab(`/agent/${uuidv7()}`, "Agent", {
      forceNewTab: true,
      state: {
        __isInternalTabNavigation: true,
        sourceUrl: sourceState.sourceUrl,
        selection: sourceState.selection,
      },
    })
  }, [sourceState.selection, sourceState.sourceUrl])

  if (!window.eidos?.fileSpaceAgent) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        File Space Agent is available in the Desktop app.
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Bot className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Agent</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {sourceState.sourceUrl
              ? "Current Space context attached"
              : "No starting resource attached"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={newConversation}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 pb-48">
          {loading && turns.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Restoring conversation…
            </div>
          ) : turns.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full border bg-muted/40 p-3">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-semibold">Ask about this Space</h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Agent reads only the resources it shows you. File changes
                require a reviewable patch and explicit approval.
              </p>
            </div>
          ) : (
            turns.map((turn) => (
              <section key={turn.runId} className="space-y-3">
                <div className="ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
                  {turn.userText}
                </div>

                {turn.contexts.map((context) => (
                  <details
                    key={`${turn.runId}:${context.path}:${context.capturedAt}`}
                    className="rounded-lg border bg-muted/20 text-xs"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate">
                        {context.path}
                      </span>
                      <span>
                        {context.reason === "selection"
                          ? "Selection"
                          : "Active tab"}
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
                        {context.rowId ? (
                          <span>Record: {context.rowId}</span>
                        ) : null}
                        {context.contentDigest ? (
                          <span>
                            Digest: {context.contentDigest.slice(0, 12)}…
                          </span>
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

                {turn.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className={`rounded-lg border text-xs ${statusTone(tool.status)}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      {tool.name === "space.files.search" ? (
                        <Search className="h-3.5 w-3.5" />
                      ) : tool.risk === "modify" ? (
                        <ShieldAlert className="h-3.5 w-3.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      <span className="font-medium">{tool.title}</span>
                      <span className="ml-auto uppercase tracking-wide opacity-70">
                        {tool.status.replace("-", " ")}
                      </span>
                    </div>
                    <div className="border-t border-current/10 px-3 py-2 text-foreground">
                      <div className="text-muted-foreground">
                        {tool.inputSummary}
                      </div>
                      {tool.resource ? (
                        <div className="mt-1 break-all font-mono text-[10px]">
                          {tool.resource}
                        </div>
                      ) : null}
                      {tool.preview ? (
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre rounded bg-background p-2 text-[11px] leading-5">
                          {tool.preview}
                        </pre>
                      ) : null}
                      {tool.resultSummary ? (
                        <div className="mt-2 whitespace-pre-wrap text-[11px]">
                          {tool.resultSummary}
                        </div>
                      ) : null}
                      {tool.error ? (
                        <div className="mt-2 text-destructive">
                          {tool.error}
                        </div>
                      ) : null}
                      {tool.status === "waiting-approval" ? (
                        <div className="mt-3 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() =>
                              void decide(turn.runId, tool.id, "deny")
                            }
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Deny
                          </Button>
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() =>
                              void decide(turn.runId, tool.id, "allow-once")
                            }
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Allow once
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {turn.assistantText ? (
                  <div className="max-w-[92%] whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {turn.assistantText}
                  </div>
                ) : turn.run &&
                  !["failed", "canceled", "interrupted"].includes(
                    turn.run.status
                  ) ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {turn.run.status === "waiting-approval"
                      ? "Waiting for approval"
                      : "Agent is working"}
                  </div>
                ) : null}
                {turn.run?.error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {turn.run.error}
                  </div>
                ) : null}
              </section>
            ))
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
          {requestError ? (
            <div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {requestError}
            </div>
          ) : null}
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder="Ask about the current Space…"
            className="max-h-40 min-h-14 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
            disabled={sending}
          />
          <div className="flex items-center gap-2 px-1">
            <select
              value={selectedModel}
              onChange={(event) => setAIModel(event.target.value)}
              className="h-7 min-w-0 max-w-52 bg-transparent text-xs text-muted-foreground outline-none"
              aria-label="Agent model"
            >
              {modelOptions.length === 0 ? (
                <option value="">Configure a model in Settings</option>
              ) : null}
              {Array.from(
                new Set(modelOptions.map((option) => option.provider))
              ).map((provider) => (
                <optgroup key={provider} label={provider}>
                  {modelOptions
                    .filter((option) => option.provider === provider)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <div className="flex-1" />
            {activeRun ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void stop()}
              >
                <CircleStop className="mr-1 h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8"
                disabled={!prompt.trim() || !selectedModel || sending}
                onClick={() => void submit()}
              >
                {sending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3.5 w-3.5" />
                )}
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
