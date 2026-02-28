import type { Agent } from "@mariozechner/pi-agent-core"
import { Bot, Context } from "grammy"

import type {
  CommandHandler,
  Message,
  MessageHandler,
  PlatformAdapter,
} from "../../types/index.js"

/**
 * Telegram platform adapter
 */
export class TelegramAdapter implements PlatformAdapter {
  readonly name = "telegram"
  private bot: Bot
  private messageHandlers: MessageHandler[] = []
  private commandHandlers: Map<string, CommandHandler> = new Map()

  constructor(botToken: string) {
    console.log("🔧 Initializing Telegram bot adapter...")

    // Configure Bot with custom fetch to handle invalid signal
    this.bot = new Bot(botToken, {
      client: {
        // Custom fetch that validates and fixes signal parameter
        // @ts-ignore - grammy types might not include fetch in client config
        fetch: async (url: string, init?: any) => {
          if (init?.signal && !(init.signal instanceof AbortSignal)) {
            delete init.signal
          }
          return fetch(url, init)
        },
      },
    })

    console.log("✅ Bot instance created")
    this.setupHandlers()
  }

  private setupHandlers(): void {
    // Handle text messages
    this.bot.on("message:text", async (ctx: Context) => {
      console.log("📨 Received message:", ctx.message?.text)
      const text = ctx.message?.text
      if (!text) return

      // Check if it's a command
      if (text.startsWith("/")) {
        const [command, ...args] = text.slice(1).split(" ")
        console.log(`🔧 Processing command: /${command}`, args)
        const handler = this.commandHandlers.get(command)

        if (handler) {
          console.log(`✅ Found handler for command: /${command}`)
          const message = this.contextToMessage(ctx)
          await handler(message, args)
        } else {
          console.log(`❌ No handler found for command: /${command}`)
          console.log(
            "Available commands:",
            Array.from(this.commandHandlers.keys())
          )
        }
        return
      }

      // Regular message
      console.log(
        `💬 Processing regular message, ${this.messageHandlers.length} handlers registered`
      )
      const message = this.contextToMessage(ctx)
      for (const handler of this.messageHandlers) {
        console.log("🔄 Calling message handler...")
        await handler(message)
      }
    })

    // Error handling
    this.bot.catch((err) => {
      console.error("❌ Telegram error:", err)
    })
  }

  private contextToMessage(ctx: Context): Message {
    return {
      id: ctx.message?.message_id?.toString() || "",
      content: ctx.message?.text || "",
      userId: ctx.from?.id?.toString() || "",
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      timestamp: (ctx.message?.date || 0) * 1000,
    }
  }

  async start(): Promise<void> {
    console.log("🤖 Starting Telegram bot...")

    try {
      // First, test network connectivity to Telegram API
      console.log("🌐 Testing network connectivity to api.telegram.org...")
      try {
        const testResponse = await fetch("https://api.telegram.org", {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        })
        console.log(
          `✅ Network test successful! Status: ${testResponse.status}`
        )
      } catch (netError: any) {
        console.error("❌ Network test failed:")
        console.error("  Error type:", netError.constructor.name)
        console.error("  Error message:", netError.message)
        throw new Error(
          `Cannot reach api.telegram.org: ${netError.message}. ` +
            `Please check your internet connection or proxy settings.`
        )
      }

      // Now verify the bot token by getting bot info
      console.log("🔍 Verifying bot token...")
      const botInfo = await this.bot.api.getMe()
      console.log(`✅ Bot verified: @${botInfo.username} (ID: ${botInfo.id})`)

      // Start polling for updates
      this.bot.start({
        onStart: (info) => {
          console.log(
            `✅ Telegram bot @${info.username} is now polling for updates!`
          )
        },
        drop_pending_updates: true,
      })
      console.log("📡 Telegram bot polling started")
    } catch (error: any) {
      console.error("❌ Failed to start Telegram bot:")
      console.error("Error type:", error.constructor.name)
      console.error("Error message:", error.message)

      if (error.error_code === 401) {
        console.error(
          "🔑 Invalid bot token! Please check your Telegram Bot Token in settings."
        )
      } else if (error.message?.includes("Cannot reach")) {
        console.error("🌐 Network connectivity issue detected.")
      }
      throw error
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Telegram bot...")
    await this.bot.stop()
  }

  async sendMessage(userId: string, content: string): Promise<void> {
    await this.bot.api.sendMessage(parseInt(userId), content.substring(0, 4096))
  }

  async updateMessage(
    userId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    const truncated = content.substring(0, 4096)

    try {
      // Try without Markdown first to avoid parse errors
      await this.bot.api.editMessageText(
        parseInt(userId),
        parseInt(messageId),
        truncated
      )
    } catch (error: any) {
      if (error.description?.includes("message is not modified")) {
        // Silent ignore - content is same as before
        return
      }
      // Re-throw other errors for handling upstream
      throw error
    }
  }

  onMessage(handler: MessageHandler): void {
    console.log("📝 Registering message handler")
    this.messageHandlers.push(handler)
    console.log(`Total message handlers: ${this.messageHandlers.length}`)
  }

  onCommand(command: string, handler: CommandHandler): void {
    console.log(`📝 Registering command handler: /${command}`)
    this.commandHandlers.set(command, handler)
  }

  /**
   * Get the underlying grammy bot instance for advanced usage
   */
  getBot(): Bot {
    return this.bot
  }
}

/**
 * Stream AI response to Telegram with batched updates
 * Optimized to avoid rate limits (429 errors)
 */
export async function streamResponse(
  adapter: TelegramAdapter,
  userId: string,
  agent: Agent,
  userMessage: string
): Promise<void> {
  console.log(
    `🚀 Starting stream response for user ${userId}, message: "${userMessage}"`
  )
  let currentText = ""
  let lastSentText = ""
  let lastUpdateTime = Date.now()
  let messageId: string | undefined
  let isCompleted = false

  // Rate limiting settings - be conservative to avoid 429
  const UPDATE_INTERVAL = 2000 // 2 seconds between updates
  const MIN_CHANGE_LENGTH = 50 // Only update if at least 50 chars changed
  const MAX_UPDATES_PER_MINUTE = 20 // Hard limit
  let updateCount = 0
  let updateCountResetTime = Date.now()

  const unsubscribe = agent.subscribe((event) => {
    if (event.type === "message_update") {
      const message = (event as any).message
      const msgEvent = event.assistantMessageEvent

      if (message?.role === "assistant" && msgEvent.type === "text_delta") {
        currentText += msgEvent.delta
      }
    } else if (event.type === "message_end") {
      const message = (event as any).message
      if (message?.role === "assistant" && message?.content) {
        const fullText = message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => (c as any).text)
          .join("")
        if (fullText && fullText.length > currentText.length) {
          currentText = fullText
        }
      }
    } else if (event.type === "agent_end") {
      console.log(`🏁 Agent completed, total text: ${currentText.length} chars`)
      isCompleted = true
    } else if (event.type === "tool_execution_end") {
      // Log tool execution to help debug
      const toolEvent = event as any
      console.log(`🔧 Tool ${toolEvent.toolName} completed`)
    }
  })

  // Check if we should update (rate limiting)
  const shouldUpdate = (): boolean => {
    const now = Date.now()

    // Reset counter every minute
    if (now - updateCountResetTime > 60000) {
      updateCount = 0
      updateCountResetTime = now
    }

    // Check hard limit
    if (updateCount >= MAX_UPDATES_PER_MINUTE) {
      return false
    }

    // Check time interval
    if (now - lastUpdateTime < UPDATE_INTERVAL) {
      return false
    }

    // Check if content changed enough
    if (currentText.length - lastSentText.length < MIN_CHANGE_LENGTH) {
      return false
    }

    return true
  }

  try {
    // Send initial thinking message
    const initialMsg = await adapter
      .getBot()
      .api.sendMessage(parseInt(userId), "💭 思考中...")
    messageId = initialMsg.message_id.toString()

    // Start agent
    const promptPromise = agent.prompt(userMessage).catch((err: any) => {
      console.error("🔥 Agent error:", err)
      isCompleted = true
    })

    // Update loop
    const updateLoop = async () => {
      while (!isCompleted) {
        if (shouldUpdate() && messageId) {
          try {
            await adapter.updateMessage(userId, messageId, currentText)
            lastSentText = currentText
            lastUpdateTime = Date.now()
            updateCount++
          } catch (error: any) {
            if (error.description?.includes("Too Many Requests")) {
              console.warn("⚠️ Telegram rate limit hit, backing off...")
              // Back off for 5 seconds
              await new Promise((r) => setTimeout(r, 5000))
            } else if (
              !error.description?.includes("message is not modified")
            ) {
              console.error("Error updating message:", error)
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    await Promise.all([promptPromise, updateLoop()])

    // Final update - always send at the end, regardless of rate limits
    if (messageId && currentText) {
      try {
        // Wait a bit to ensure any pending rate limit clears
        await new Promise((r) => setTimeout(r, 500))

        if (currentText !== lastSentText) {
          console.log(`📝 Final update: ${currentText.length} chars`)
          await adapter.updateMessage(userId, messageId, currentText)
          console.log(`✅ Final update sent successfully`)
        } else {
          console.log(`📝 Content unchanged, skipping final update`)
        }
      } catch (error: any) {
        console.error(`❌ Final update failed: ${error.message || error}`)
        // Always try to send as new message if update fails
        try {
          console.log(`📝 Sending as new message instead`)
          await adapter.sendMessage(userId, currentText)
          console.log(`✅ Sent as new message successfully`)
        } catch (sendError: any) {
          console.error(
            `❌ Failed to send as new message: ${sendError.message || sendError}`
          )
          // Last resort: send truncated message
          const truncated =
            currentText.substring(0, 3800) + "\n\n...(truncated)"
          await adapter.sendMessage(userId, truncated)
        }
      }
    } else {
      console.log(
        `⚠️ Final update skipped: messageId=${messageId}, textLength=${currentText?.length}`
      )
    }
  } catch (error) {
    console.error("Error in streamResponse:", error)
    if (messageId) {
      await adapter.updateMessage(
        userId,
        messageId,
        "❌ 抱歉，处理您的请求时遇到错误。"
      )
    }
  } finally {
    unsubscribe()
  }
}
