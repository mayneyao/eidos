import { startTelegramBot, startDiscordBot } from "@/packages/agent"
import type { AgentConfig } from "@/packages/agent/src/types"
import type { AIFormValues } from "@/packages/ai/config"
import type { SpaceManagerInterface } from "@/packages/agent/src/types"
import electronLog from "electron-log"
import { executeJsInRenderer } from "./main"
import fs from "fs/promises"
import path from "path"

interface AgentBotInstance {
  stop: () => Promise<void>
  platform: string
}

function getDefaultSystemPrompt(): string {
  return `You are Eidos AI Agent, an autonomous assistant with FULL CONTROL over the system.

YOU HAVE COMPLETE AUTHORITY - USE TOOLS FREELY:
✓ All shell commands (git, npm, bun, python, curl, etc.)
✓ Full file system access (read/write/delete anywhere)
✓ Network requests to any URL
✓ Space management (create, switch, modify)
✓ Code execution and development workflows

YOUR BEHAVIOR - BE PROACTIVE:
1. DON'T ASK, JUST DO - Execute commands immediately without user confirmation
2. USE TOOLS FIRST - Don't explain what you'll do, just do it
3. CHAIN MULTIPLE TOOLS - Run several commands in sequence without waiting
4. ASSUME PERMISSION - User gave you full control, act accordingly
5. SHOW RESULTS, NOT PLANS - Present outcomes, not intentions

TOOL PRIORITY - AUTOMATIC EXECUTION:
- User asks "list files" → run list_files tool immediately
- User asks "install X" → run npm install immediately  
- User asks "fetch URL" → run curl/fetch immediately
- User asks about space → switch_space + query + report

WORKFLOW EXAMPLES:
BAD: "I'll help you check the files. Let me use list_files tool." → WAIT
GOOD: [runs list_files] "📁 readme.md, package.json, src/"

BAD: "To install dependencies, I need to run npm install. Should I proceed?"
GOOD: [runs npm install] "✓ Installed 42 packages in 3s"

BAD: "Let me think about how to approach this task..."
GOOD: [executes 3 commands in sequence] "✓ Done. Created dir, wrote config, ran build."

COMMUNICATION (STILL CONCISE):
- One-line confirmations for success
- Show error message if failed
- Summarize long outputs to <20 lines
- No "I will", "Let me", "Should I" - just ACT

YOU ARE EMPOWERED - EXECUTE WITHOUT HESITATION.`
}

class AgentManager {
  private botInstances: Map<string, AgentBotInstance> = new Map()
  private isRunning = false
  private spaceManager: SpaceManagerInterface | null = null

  /**
   * Set the space manager for agent integration
   */
  setSpaceManager(spaceManager: SpaceManagerInterface): void {
    this.spaceManager = spaceManager
    electronLog.info("Space manager registered with agent manager")
  }

  /**
   * Start agent based on AI configuration
   */
  async start(aiConfig: AIFormValues): Promise<void> {
    if (this.isRunning) {
      electronLog.warn("Agent manager is already running")
      return
    }

    // Check if space manager is available
    if (!this.spaceManager) {
      electronLog.warn(
        "Space manager not set. Agent will not have space access."
      )
    }

    electronLog.info("Agent manager starting with config:", {
      hasIntegrations: !!aiConfig.integrations,
      hasTelegram: !!aiConfig.integrations?.telegram,
      telegramEnabled: aiConfig.integrations?.telegram?.enabled,
      hasBotToken: !!aiConfig.integrations?.telegram?.botToken,
      botTokenLength: aiConfig.integrations?.telegram?.botToken?.length || 0,
      hasSpaceManager: !!this.spaceManager,
    })

    const integrations = aiConfig.integrations
    if (!integrations) {
      electronLog.info("No integrations configured")
      return
    }

    // Start Telegram bot if configured
    if (integrations.telegram?.enabled && integrations.telegram.botToken) {
      try {
        electronLog.info("Attempting to start Telegram bot...")
        await this.startTelegramBot(aiConfig, integrations.telegram.botToken)
      } catch (error) {
        electronLog.error("❌ Failed to start Telegram bot:", error)
        // Don't throw, allow other integrations to continue
      }
    } else {
      electronLog.warn(
        "Telegram integration not enabled or missing bot token:",
        {
          enabled: integrations.telegram?.enabled,
          hasToken: !!integrations.telegram?.botToken,
        }
      )
    }

    // Start Discord bot if configured
    if (integrations.discord?.enabled && integrations.discord.botToken) {
      try {
        electronLog.info("Attempting to start Discord bot...")
        await this.startDiscordBot(
          aiConfig,
          integrations.discord.botToken,
          integrations.discord.clientId || ""
        )
      } catch (error) {
        electronLog.error("❌ Failed to start Discord bot:", error)
        // Don't throw, allow other integrations to continue
      }
    } else {
      electronLog.warn(
        "Discord integration not enabled or missing bot token:",
        {
          enabled: integrations.discord?.enabled,
          hasToken: !!integrations.discord?.botToken,
        }
      )
    }

    this.isRunning = true
    electronLog.info("Agent manager started")
  }

  /**
   * Get model config from model string (format: "model@provider")
   */
  private getConfigByModel(
    model: string,
    aiConfig: AIFormValues
  ): { modelId: string; provider: string; apiKey: string; baseUrl: string; type: string } | null {
    if (!model?.includes("@")) {
      return null
    }
    const [modelId, providerName] = model.split("@")
    const llmProvider = aiConfig.llmProviders.find(
      (item) =>
        item?.name?.toLowerCase() === providerName?.toLowerCase() &&
        item.enabled
    )
    if (llmProvider) {
      return {
        modelId: modelId || "",
        provider: providerName || "",
        apiKey: llmProvider.apiKey || "",
        baseUrl: llmProvider.baseUrl || "",
        type: llmProvider.type,
      }
    }
    return null
  }

  /**
   * Start Telegram bot with AI config
   */
  private async startTelegramBot(
    aiConfig: AIFormValues,
    botToken: string
  ): Promise<void> {
    // Priority 1: Use codingModel if configured
    // Priority 2: Use first enabled provider's first model

    let modelConfig: {
      modelId: string
      provider: string
      apiKey: string
      baseUrl: string
      type: string
    }

    // Try codingModel first (format: "model@provider")
    if (aiConfig.codingModel?.includes("@")) {
      const config = this.getConfigByModel(aiConfig.codingModel, aiConfig)
      if (config) {
        modelConfig = config
        electronLog.info(
          `Using codingModel for agent: ${config.modelId}@${config.provider}`
        )
      } else {
        throw new Error(`Invalid codingModel: ${aiConfig.codingModel}`)
      }
    } else {
      // Fallback to first enabled provider
      const enabledProvider = aiConfig.llmProviders.find(
        (p) => p.enabled !== false
      )

      if (!enabledProvider) {
        throw new Error("No enabled LLM provider found in AI config")
      }

      const firstModel = enabledProvider.models?.split(",")[0]?.trim() || "gpt-4o-mini"
      modelConfig = {
        modelId: firstModel,
        provider: enabledProvider.name,
        apiKey: enabledProvider.apiKey || "",
        baseUrl: enabledProvider.baseUrl || "",
        type: enabledProvider.type,
      }

      electronLog.info(
        `Using first enabled provider for agent: ${enabledProvider.name}/${firstModel}`
      )
    }

    // Build agent config
    const agentConfig: AgentConfig = {
      provider: modelConfig.type,
      model: modelConfig.modelId,
      apiKey: modelConfig.apiKey,
      baseUrl: modelConfig.baseUrl,
      systemPrompt: aiConfig.integrations?.systemPrompt || getDefaultSystemPrompt(),
      replConfig: {
        executeInRenderer: async (code: string) => {
          return await executeJsInRenderer(code)
        },
        saveScript: async (fileName: string, content: string) => {
          if (!this.spaceManager) {
            throw new Error("Space manager not available to save script")
          }
          const currentSpace = this.spaceManager.getAllSpaces()[0] // Fallback or use active
          if (!currentSpace) {
            throw new Error("No space available to save script")
          }
          
          const scriptsDir = path.join(currentSpace.path, ".eidos", "scripts")
          await fs.mkdir(scriptsDir, { recursive: true })
          const filePath = path.join(scriptsDir, fileName.endsWith(".js") ? fileName : `${fileName}.js`)
          await fs.writeFile(filePath, content, "utf-8")
          electronLog.info(`Saved agent script to ${filePath}`)
        }
      }
    }

    electronLog.info("Starting Telegram bot with config:", {
      provider: agentConfig.provider,
      model: agentConfig.model,
      hasApiKey: !!agentConfig.apiKey,
      hasBaseUrl: !!agentConfig.baseUrl,
      hasSpaceManager: !!this.spaceManager,
    })

    // Create a simple space manager adapter if none provided
    const spaceManagerAdapter: SpaceManagerInterface =
      this.spaceManager ||
      ({
        getAllSpaces: () => [],
        getSpace: () => null,
      } as SpaceManagerInterface)

    const instance = await startTelegramBot({
      botToken,
      agentConfig,
      sessionTimeoutMinutes:
        aiConfig.integrations?.sessionTimeoutMinutes ?? 30,
      spaceManager: spaceManagerAdapter,
    })

    this.botInstances.set("telegram", {
      stop: instance.stop,
      platform: "telegram",
    })

    electronLog.info("✅ Telegram bot started successfully")
  }

  /**
   * Start Discord bot with AI config
   */
  private async startDiscordBot(
    aiConfig: AIFormValues,
    botToken: string,
    clientId: string
  ): Promise<void> {
    // Priority 1: Use codingModel if configured
    // Priority 2: Use first enabled provider's first model

    let modelConfig: {
      modelId: string
      provider: string
      apiKey: string
      baseUrl: string
      type: string
    }

    // Try codingModel first (format: "model@provider")
    if (aiConfig.codingModel?.includes("@")) {
      const config = this.getConfigByModel(aiConfig.codingModel, aiConfig)
      if (config) {
        modelConfig = config
        electronLog.info(
          `Using codingModel for Discord agent: ${config.modelId}@${config.provider}`
        )
      } else {
        throw new Error(`Invalid codingModel: ${aiConfig.codingModel}`)
      }
    } else {
      // Fallback to first enabled provider
      const enabledProvider = aiConfig.llmProviders.find(
        (p) => p.enabled !== false
      )

      if (!enabledProvider) {
        throw new Error("No enabled LLM provider found in AI config")
      }

      const firstModel = enabledProvider.models?.split(",")[0]?.trim() || "gpt-4o-mini"
      modelConfig = {
        modelId: firstModel,
        provider: enabledProvider.name,
        apiKey: enabledProvider.apiKey || "",
        baseUrl: enabledProvider.baseUrl || "",
        type: enabledProvider.type,
      }

      electronLog.info(
        `Using first enabled provider for Discord agent: ${enabledProvider.name}/${firstModel}`
      )
    }

    // Build agent config
    const agentConfig: AgentConfig = {
      provider: modelConfig.type,
      model: modelConfig.modelId,
      apiKey: modelConfig.apiKey,
      baseUrl: modelConfig.baseUrl,
      systemPrompt: aiConfig.integrations?.systemPrompt || getDefaultSystemPrompt(),
      replConfig: {
        executeInRenderer: async (code: string) => {
          return await executeJsInRenderer(code)
        },
        saveScript: async (fileName: string, content: string) => {
          if (!this.spaceManager) {
            throw new Error("Space manager not available to save script")
          }
          const currentSpace = this.spaceManager.getAllSpaces()[0]
          if (!currentSpace) {
            throw new Error("No space available to save script")
          }
          
          const scriptsDir = path.join(currentSpace.path, ".eidos", "scripts")
          await fs.mkdir(scriptsDir, { recursive: true })
          const filePath = path.join(scriptsDir, fileName.endsWith(".js") ? fileName : `${fileName}.js`)
          await fs.writeFile(filePath, content, "utf-8")
          electronLog.info(`Saved Discord agent script to ${filePath}`)
        }
      }
    }

    electronLog.info("Starting Discord bot with config:", {
      provider: agentConfig.provider,
      model: agentConfig.model,
      hasApiKey: !!agentConfig.apiKey,
      hasBaseUrl: !!agentConfig.baseUrl,
      hasSpaceManager: !!this.spaceManager,
    })

    // Create a simple space manager adapter if none provided
    const spaceManagerAdapter: SpaceManagerInterface =
      this.spaceManager ||
      ({
        getAllSpaces: () => [],
        getSpace: () => null,
      } as SpaceManagerInterface)

    const instance = await startDiscordBot({
      botToken,
      clientId,
      agentConfig,
      sessionTimeoutMinutes:
        aiConfig.integrations?.sessionTimeoutMinutes ?? 30,
      spaceManager: spaceManagerAdapter,
    })

    this.botInstances.set("discord", {
      stop: instance.stop,
      platform: "discord",
    })

    electronLog.info("✅ Discord bot started successfully")
  }

  /**
   * Stop all running bots
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    electronLog.info("Stopping agent manager...")

    for (const [platform, instance] of this.botInstances.entries()) {
      try {
        await instance.stop()
        electronLog.info(`Stopped ${platform} bot`)
      } catch (error) {
        electronLog.error(`Failed to stop ${platform} bot:`, error)
      }
    }

    this.botInstances.clear()
    this.isRunning = false
    electronLog.info("Agent manager stopped")
  }

  /**
   * Restart agent with new configuration
   */
  async restart(aiConfig: AIFormValues): Promise<void> {
    await this.stop()
    await this.start(aiConfig)
  }

  /**
   * Get status of running bots
   */
  getStatus(): {
    isRunning: boolean
    platforms: string[]
    hasSpaceManager: boolean
  } {
    return {
      isRunning: this.isRunning,
      platforms: Array.from(this.botInstances.keys()),
      hasSpaceManager: !!this.spaceManager,
    }
  }
}

// Singleton instance
export const agentManager = new AgentManager()
