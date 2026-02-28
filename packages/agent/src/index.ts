import type { PlatformAdapter } from "./types/index.js"
import type { AgentConfig, SpaceManagerInterface } from "./types/index.js"
import { SessionManager } from "./agent/session-manager.js"
import { TelegramAdapter, streamResponse } from "./platforms/telegram/adapter.js"
import { DiscordAdapter, streamDiscordResponse } from "./platforms/discord/adapter.js"
import { registerCommonCommands } from "./core/commands.js"
import { registerSpaceCommands } from "./commands/space-commands.js"
import { createAgent } from "./agent/ai-agent.js"

// Re-export types and core classes
export { SessionManager } from "./agent/session-manager.js"
export { createAgent } from "./agent/ai-agent.js"
export { TelegramAdapter, streamResponse } from "./platforms/telegram/adapter.js"
export { DiscordAdapter, streamDiscordResponse } from "./platforms/discord/adapter.js"
export { registerCommonCommands } from "./core/commands.js"
export { SpaceFileSystem } from "./tools/space-tools.js"
export { createShellTools, createShellToolsForSpace } from "./tools/shell-tools.js"
export { loadAllSkills, formatSkillsForSystemPrompt } from "./skills/index.js"
export type { Skill, SkillMetadata, SkillLocation } from "./skills/index.js"
export type {
  AgentConfig,
  UserSession,
  PlatformAdapter,
  Message,
  MessageHandler,
  CommandHandler,
  PlatformConfig,
  SpaceManagerInterface,
} from "./types/index.js"

/**
 * Agent bot configuration
 */
export interface AgentBotConfig {
  agentConfig: AgentConfig
  platform: PlatformAdapter
  sessionTimeoutMinutes?: number
  spaceManager: SpaceManagerInterface
}

/**
 * Start an agent bot with any platform adapter
 * This is the main library API
 */
export async function startAgentBot(
  config: AgentBotConfig
): Promise<{
  platform: PlatformAdapter
  sessionManager: SessionManager
  stop: () => Promise<void>
}> {
  const {
    agentConfig,
    platform,
    sessionTimeoutMinutes = 30,
    spaceManager,
  } = config

  console.log(`🤖 Using LLM: ${agentConfig.provider}/${agentConfig.model}`)
  console.log(`📱 Platform: ${platform.name}`)

  // Create session manager first (will be used by agent factory)
  let sessionManager: SessionManager

  // Create agent factory with space context support
  const agentFactory = (
    config: AgentConfig,
    spaceContext?: any
  ) => {
    return createAgent(config, spaceContext, {
      getCurrentSpace: (userId: string) =>
        sessionManager.getCurrentSpace(userId),
      switchSpace: (userId: string, spaceId: string) =>
        sessionManager.switchSpace(userId, spaceId),
    })
  }

  // Create session manager with space support
  sessionManager = new SessionManager(
    agentConfig,
    spaceManager,
    agentFactory,
    sessionTimeoutMinutes
  )

  // Register common commands
  registerCommonCommands(platform, sessionManager, {
    modelName: agentConfig.model,
  })

  // Register space commands
  registerSpaceCommands(platform, sessionManager, spaceManager)

  // Register message handler (platform-specific streaming logic)
  platform.onMessage(async (message) => {
    const agent = sessionManager.getAgent(
      message.userId,
      message.username,
      message.firstName
    )

    // For Telegram, use streaming
    if (platform instanceof TelegramAdapter) {
      await streamResponse(
        platform as TelegramAdapter,
        message.userId,
        agent,
        message.content
      )
    } else if (platform instanceof DiscordAdapter) {
      // For Discord, use Discord streaming
      await streamDiscordResponse(
        platform as DiscordAdapter,
        message.userId,
        agent,
        message.content
      )
    } else {
      // For other platforms, implement their specific response handling
      console.warn(`Streaming not implemented for platform: ${platform.name}`)
    }
  })

  // Start the platform (IMPORTANT: await this!)
  await platform.start()

  // Return control interface
  const stop = async () => {
    console.log("🛑 Shutting down agent bot...")
    sessionManager.destroy()
    await platform.stop()
  }

  return { platform, sessionManager, stop }
}

/**
 * Convenience function to start a Telegram bot
 */
export async function startTelegramBot(config: {
  botToken: string
  agentConfig: AgentConfig
  sessionTimeoutMinutes?: number
  spaceManager: SpaceManagerInterface
}) {
  const adapter = new TelegramAdapter(config.botToken)
  return await startAgentBot({
    agentConfig: config.agentConfig,
    platform: adapter,
    sessionTimeoutMinutes: config.sessionTimeoutMinutes,
    spaceManager: config.spaceManager,
  })
}

/**
 * Convenience function to start a Discord bot
 */
export async function startDiscordBot(config: {
  botToken: string
  clientId: string
  agentConfig: AgentConfig
  sessionTimeoutMinutes?: number
  spaceManager: SpaceManagerInterface
}) {
  const adapter = new DiscordAdapter({
    botToken: config.botToken,
    clientId: config.clientId,
  })
  return await startAgentBot({
    agentConfig: config.agentConfig,
    platform: adapter,
    sessionTimeoutMinutes: config.sessionTimeoutMinutes,
    spaceManager: config.spaceManager,
  })
}
