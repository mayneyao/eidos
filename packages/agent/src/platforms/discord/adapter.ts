import type { Agent } from "@mariozechner/pi-agent-core"
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  Message as DiscordMessage,
  TextChannel,
  DMChannel,
  ThreadChannel,
} from "discord.js"

import type {
  CommandHandler,
  Message,
  MessageHandler,
  PlatformAdapter,
} from "../../types/index.js"

/**
 * Discord platform adapter
 */
export class DiscordAdapter implements PlatformAdapter {
  readonly name = "discord"
  private client: Client
  private botToken: string
  private messageHandlers: MessageHandler[] = []
  private commandHandlers: Map<string, CommandHandler> = new Map()
  private messageChannelMap: Map<string, string> = new Map() // messageId -> channelId

  constructor(config: { botToken: string; clientId: string }) {
    console.log("🔧 Initializing Discord bot adapter...")

    this.botToken = config.botToken

    // Create Discord client with necessary intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    })

    this.setupHandlers()
    console.log("✅ Discord client instance created")
  }

  private setupHandlers(): void {
    // Handle ready event
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`✅ Discord bot logged in as ${readyClient.user.tag}`)
    })

    // Handle messages
    this.client.on(Events.MessageCreate, async (message: DiscordMessage) => {
      // Ignore bot messages
      if (message.author.bot) return

      // Only handle DMs for now (for privacy/security)
      if (!message.channel.isDMBased()) {
        console.log("📝 Ignoring non-DM message from guild:", message.guild?.name)
        return
      }

      console.log("📨 Received Discord message:", message.content)
      const text = message.content
      if (!text) return

      // Store message-channel mapping for updates
      this.messageChannelMap.set(message.id, message.channelId)

      // Check if it's a command
      if (text.startsWith("/")) {
        const [command, ...args] = text.slice(1).split(" ")
        console.log(`🔧 Processing Discord command: /${command}`, args)
        const handler = this.commandHandlers.get(command)

        if (handler) {
          console.log(`✅ Found handler for command: /${command}`)
          const msg = this.discordMessageToMessage(message)
          await handler(msg, args)
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
        `💬 Processing regular Discord message, ${this.messageHandlers.length} handlers registered`
      )
      const msg = this.discordMessageToMessage(message)
      for (const handler of this.messageHandlers) {
        console.log("🔄 Calling message handler...")
        await handler(msg)
      }
    })

    // Error handling
    this.client.on(Events.Error, (error) => {
      console.error("❌ Discord client error:", error)
    })

    // Warning handling
    this.client.on(Events.Warn, (warning) => {
      console.warn("⚠️ Discord client warning:", warning)
    })
  }

  private discordMessageToMessage(message: DiscordMessage): Message {
    return {
      id: message.id,
      content: message.content,
      userId: message.author.id,
      username: message.author.username,
      firstName: message.author.globalName || message.author.username,
      timestamp: message.createdTimestamp,
    }
  }

  async start(): Promise<void> {
    console.log("🤖 Starting Discord bot...")

    try {
      // Login to Discord
      await this.client.login(this.botToken)
      console.log("📡 Discord bot started successfully")
    } catch (error: any) {
      console.error("❌ Failed to start Discord bot:")
      console.error("Error type:", error.constructor.name)
      console.error("Error message:", error.message)

      if (error.code === "TokenInvalid") {
        console.error(
          "🔑 Invalid bot token! Please check your Discord Bot Token in settings."
        )
      } else if (error.code === "DisallowedIntents") {
        console.error(
          "🔒 Disallowed intents! Please enable 'Message Content Intent' in your Discord bot settings."
        )
      }
      throw error
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Discord bot...")
    this.client.destroy()
    console.log("✅ Discord bot stopped")
  }

  async sendMessage(userId: string, content: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId)
      const sentMessage = await user.send(content.substring(0, 2000))
      // Store the message-channel mapping for potential updates
      this.messageChannelMap.set(sentMessage.id, sentMessage.channelId)
    } catch (error: any) {
      console.error("❌ Failed to send Discord message:", error.message)
      throw error
    }
  }

  async updateMessage(
    userId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    try {
      const truncated = content.substring(0, 2000)

      // Get channel ID from our map
      const channelId = this.messageChannelMap.get(messageId)
      if (!channelId) {
        console.warn(`⚠️ No channel mapping found for message ${messageId}`)
        // Try to send as new message instead
        await this.sendMessage(userId, truncated)
        return
      }

      // Fetch the channel
      const channel = await this.client.channels.fetch(channelId)
      if (
        !channel ||
        (!(channel instanceof DMChannel) &&
          !(channel instanceof TextChannel) &&
          !(channel instanceof ThreadChannel))
      ) {
        throw new Error("Channel not found or not text-based")
      }

      // Fetch and edit the message
      const message = await channel.messages.fetch(messageId)
      await message.edit(truncated)
    } catch (error: any) {
      if (error.message?.includes("Unknown Message")) {
        console.warn("⚠️ Message not found, cannot update")
        return
      }
      // Re-throw other errors for handling upstream
      throw error
    }
  }

  onMessage(handler: MessageHandler): void {
    console.log("📝 Registering message handler for Discord")
    this.messageHandlers.push(handler)
    console.log(`Total Discord message handlers: ${this.messageHandlers.length}`)
  }

  onCommand(command: string, handler: CommandHandler): void {
    console.log(`📝 Registering Discord command handler: /${command}`)
    this.commandHandlers.set(command, handler)
  }

  /**
   * Get the underlying Discord client instance for advanced usage
   */
  getClient(): Client {
    return this.client
  }
}

/**
 * Stream AI response to Discord with batched updates
 * Optimized to avoid rate limits
 */
export async function streamDiscordResponse(
  adapter: DiscordAdapter,
  userId: string,
  agent: Agent,
  userMessage: string
): Promise<void> {
  console.log(
    `🚀 Starting Discord stream response for user ${userId}, message: "${userMessage}"`
  )
  let currentText = ""
  let lastSentText = ""
  let lastUpdateTime = Date.now()
  let messageId: string | undefined
  let isCompleted = false

  // Rate limiting settings - Discord is more strict than Telegram
  const UPDATE_INTERVAL = 3000 // 3 seconds between updates
  const MIN_CHANGE_LENGTH = 100 // Only update if at least 100 chars changed
  const MAX_UPDATES_PER_MINUTE = 10 // Hard limit (Discord is more strict)
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
      console.log(`🏁 Discord agent completed, total text: ${currentText.length} chars`)
      isCompleted = true
    } else if (event.type === "tool_execution_end") {
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
    await adapter.sendMessage(userId, "💭 思考中...")
    // Get the last sent message ID (we need to track this differently)
    // For now, we'll store it when we send the initial message
    const client = adapter.getClient()
    const user = await client.users.fetch(userId)
    const dmChannel = await user.createDM()
    const messages = await dmChannel.messages.fetch({ limit: 1 })
    const initialMsg = messages.first()
    if (initialMsg) {
      messageId = initialMsg.id
    }

    // Start agent
    const promptPromise = agent.prompt(userMessage).catch((err: any) => {
      console.error("🔥 Discord agent error:", err)
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
            if (error.message?.includes("rate limit")) {
              console.warn("⚠️ Discord rate limit hit, backing off...")
              // Back off for 10 seconds (Discord rate limits are stricter)
              await new Promise((r) => setTimeout(r, 10000))
            } else {
              console.error("Error updating Discord message:", error)
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    await Promise.all([promptPromise, updateLoop()])

    // Final update - always send at the end
    if (messageId && currentText) {
      try {
        // Wait a bit to ensure any pending rate limit clears
        await new Promise((r) => setTimeout(r, 1000))

        if (currentText !== lastSentText) {
          console.log(`📝 Discord final update: ${currentText.length} chars`)
          await adapter.updateMessage(userId, messageId, currentText)
          console.log(`✅ Discord final update sent successfully`)
        } else {
          console.log(`📝 Discord content unchanged, skipping final update`)
        }
      } catch (error: any) {
        console.error(`❌ Discord final update failed: ${error.message || error}`)
        // Try to send as new message if update fails
        try {
          console.log(`📝 Sending as new Discord message instead`)
          await adapter.sendMessage(userId, currentText)
          console.log(`✅ Sent as new Discord message successfully`)
        } catch (sendError: any) {
          console.error(
            `❌ Failed to send as new Discord message: ${sendError.message || sendError}`
          )
          // Last resort: send truncated message
          const truncated =
            currentText.substring(0, 1900) + "\n\n...(truncated)"
          await adapter.sendMessage(userId, truncated)
        }
      }
    } else {
      console.log(
        `⚠️ Discord final update skipped: messageId=${messageId}, textLength=${currentText?.length}`
      )
    }
  } catch (error) {
    console.error("Error in streamDiscordResponse:", error)
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
