import { Chat } from "chat"
import { createTelegramAdapter } from "@chat-adapter/telegram"
import { createMemoryState } from "@chat-adapter/state-memory"

import type { DataSpace } from "@/packages/core/data-space"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"
import type { ToolLoopAgent } from "ai"
import type { UIMessage } from "ai"

import { uuidv7 } from "@/lib/utils"
import type { AIFormValues } from "../config"
import { prepareAgent } from "./agent-api"
import type { IAgentData } from "./agent-api"

interface ChannelDeps {
  getDataspace: (space: string) => Promise<DataSpace | null>
  getAIConfig: () => AIFormValues | undefined
  spaceRegistry: {
    validateSpace(spaceId: string): boolean
  }
  logger?: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
}

/**
 * Manages the Chat SDK bot lifecycle for Telegram polling.
 */
export class ChannelService {
  private bot: Chat | null = null
  private running = false
  private log: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }

  /** Per-chat space overrides from `/space xxx` commands */
  private chatSpaceMap = new Map<string, string>()

  /** In-memory message cache to avoid repeated disk reads per session */
  private messageCache = new Map<string, UIMessage[]>()

  /** Active agent runs per session, keyed by sessionId */
  private activeRuns = new Map<string, AbortController>()

  constructor(private deps: ChannelDeps) {
    this.log = deps.logger ?? console
  }

  async start(): Promise<void> {
    const aiConfig = this.deps.getAIConfig()
    const tg = aiConfig?.channels?.telegram
    if (!tg?.enabled || !tg.botToken) {
      this.log.info("[channel] Telegram not enabled or no token, skipping")
      return
    }

    const telegram = createTelegramAdapter({
      botToken: tg.botToken,
      mode: "polling",
      longPolling: { deleteWebhook: false },
    })

    this.bot = new Chat({
      userName: "eidos",
      adapters: { telegram },
      state: createMemoryState(),
    })

    this.registerHandlers()

    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bot.initialize()
        break
      } catch (err) {
        if (attempt === maxRetries) throw err
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000)
        this.log.warn(
          `[channel] Telegram init failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
          err instanceof Error ? err.message : err
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    this.running = true
    this.log.info("[channel] Telegram bot started (polling)")
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.shutdown()
      this.bot = null
    }
    this.running = false
    this.log.info("[channel] Telegram bot stopped")
  }

  isRunning(): boolean {
    return this.running
  }

  private registerHandlers(): void {
    if (!this.bot) return

    // First message in a new chat — subscribe then handle the message
    this.bot.onNewMention(async (thread, message) => {
      await thread.subscribe()
      await this.handleIncomingMessage(thread, message)
    })

    // All subsequent messages in subscribed chats
    this.bot.onSubscribedMessage(async (thread, message) => {
      await this.handleIncomingMessage(thread, message)
    })
  }

  private async handleIncomingMessage(
    thread: any,
    message: any
  ): Promise<void> {
    const text = message.text?.trim()
    if (!text) return

    // Handle /space command
    const spaceMatch = text.match(/^\/space\s+(\S+)/i)
    if (spaceMatch) {
      const spaceId = spaceMatch[1]
      if (this.deps.spaceRegistry.validateSpace(spaceId)) {
        this.chatSpaceMap.set(thread.id, spaceId)
        await thread.post(`Switched to space: ${spaceId}`)
      } else {
        await thread.post(`Space not found: ${spaceId}`)
      }
      return
    }

    // Handle /stop command
    if (/^\/stop$/i.test(text)) {
      const sessionId = `tg-${thread.id}`
      const controller = this.activeRuns.get(sessionId)
      if (controller) {
        controller.abort()
        await thread.post("Agent stopped.")
      } else {
        await thread.post("No active agent to stop.")
      }
      return
    }

    // Run agent
    await this.handleAgentMessage(thread, message)
  }

  private resolveSpace(threadId: string): string | undefined {
    const override = this.chatSpaceMap.get(threadId)
    if (override) return override
    return this.deps.getAIConfig()?.channels?.telegram?.defaultSpace
  }

  private async handleAgentMessage(thread: any, message: any): Promise<void> {
    const aiConfig = this.deps.getAIConfig()
    const tg = aiConfig?.channels?.telegram
    const space = this.resolveSpace(thread.id)
    const model = tg?.defaultModel

    if (!space) {
      await thread.post(
        "No space configured. Set a default space in Eidos settings or use /space <id>."
      )
      return
    }

    if (!model) {
      await thread.post(
        "No model configured. Set a default model in Eidos AI settings."
      )
      return
    }

    const dataspace = await this.deps.getDataspace(space)
    if (!dataspace) {
      await thread.post(`Failed to load space: ${space}`)
      return
    }

    const sessionId = `tg-${thread.id}`
    const store = new AgentSessionStore(dataspace)

    // Load from cache or disk
    if (!this.messageCache.has(sessionId)) {
      let existingMessages: UIMessage[] = []
      try {
        const session = await store.load(sessionId)
        if (session?.messages) {
          existingMessages = session.messages as UIMessage[]
        }
      } catch {
        // No existing session — start fresh
      }
      this.messageCache.set(sessionId, existingMessages)
    }

    const userMessage: UIMessage = {
      id: uuidv7(),
      role: "user",
      parts: [{ type: "text", text: message.text }],
    }

    const cached = this.messageCache.get(sessionId)!
    cached.push(userMessage)

    // Sliding window: keep last 20 messages for context
    const allMessages = cached.slice(-20)

    const agentData: IAgentData = {
      goal: message.text,
      messages: allMessages,
      model,
      space,
      id: sessionId,
    }

    const abortController = new AbortController()
    this.activeRuns.set(sessionId, abortController)

    try {
      this.log.info("[channel] ▶ preparing agent", { sessionId, model, space })
      const prepared = await prepareAgent(agentData, {
        getDataspace: this.deps.getDataspace,
        getAIConfig: this.deps.getAIConfig,
        signal: abortController.signal,
      })

      this.log.info("[channel] ▶ streaming response")

      // Collect full text while streaming to Chat SDK
      let fullText = ""
      const textStream = (async function* (self: ChannelService) {
        for await (const text of self.streamAgentText(
          prepared,
          abortController.signal
        )) {
          fullText += text
          yield text
        }
      })(this)

      // Chat SDK handles Telegram post+edit streaming
      await thread.post(textStream)
      this.log.info("[channel] ▶ stream done", { length: fullText.length })

      // Update cache with assistant response
      if (fullText) {
        cached.push({
          id: uuidv7(),
          role: "assistant",
          parts: [{ type: "text", text: fullText }],
        })
      }

      // Persist
      await this.persistResponse(store, prepared, fullText)
    } catch (err) {
      if (abortController.signal.aborted) {
        this.log.info("[channel] ▶ agent aborted by user")
        return
      }
      this.log.error("[channel] Agent error:", err)
      await thread.post(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      this.activeRuns.delete(sessionId)
    }
  }

  /**
   * Run the agent and yield text deltas for Chat SDK streaming.
   * UIMessageChunk from toUIMessageStream() uses `delta` field (not `textDelta`).
   */
  private async *streamAgentText(
    prepared: {
      agent: ToolLoopAgent
      modelMessages: any[]
      messages: UIMessage[]
    },
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const { agent, modelMessages, messages } = prepared

    const result = await agent.stream({
      abortSignal: signal,
      messages: modelMessages as any,
    })

    const stream = result.toUIMessageStream({ originalMessages: messages })

    for await (const chunk of stream) {
      if (chunk.type === "text-delta" && "delta" in chunk) {
        yield (chunk as any).delta
      }
    }
  }

  /**
   * Persist the agent response to the session store.
   */
  private async persistResponse(
    store: AgentSessionStore,
    prepared: {
      id: string
      sessionGoal: string
      modelAndProvider: string
      space: string
      createdAt: string
      existingMeta: any
      messages: UIMessage[]
    },
    fullText: string
  ): Promise<void> {
    const {
      id,
      sessionGoal,
      modelAndProvider,
      space,
      createdAt,
      existingMeta,
      messages,
    } = prepared

    try {
      await store.saveMeta(id, {
        id,
        goal: sessionGoal,
        model: modelAndProvider,
        space,
        createdAt,
        completedAt: new Date().toISOString(),
        parentId: existingMeta?.parentId,
        forkedMessageId: existingMeta?.forkedMessageId,
      })

      // Save the user message
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg) {
        await store.appendUserMessage(id, lastUserMsg)
      }

      // Save the assistant response
      if (fullText) {
        const assistantMsgId = uuidv7()
        await store.appendStepMessage(id, assistantMsgId, [
          { type: "text", text: fullText },
        ])
      }
    } catch (err) {
      this.log.error("[channel] Persist error:", err)
    }
  }
}
