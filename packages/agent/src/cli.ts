import dotenv from "dotenv"
import { startTelegramBot } from "./index.js"
import type { SpaceManagerInterface } from "./types/index.js"

// Load environment variables
dotenv.config()

const BOT_TOKEN = process.env.BOT_TOKEN

if (!BOT_TOKEN) {
  console.error("❌ Error: BOT_TOKEN is not set in environment variables")
  console.error("Please create a .env file with your bot token:")
  console.error("BOT_TOKEN=your_bot_token_here")
  process.exit(1)
}

// Get LLM configuration from environment
const agentConfig = {
  provider: process.env.LLM_PROVIDER || "openai",
  model: process.env.LLM_MODEL || "gpt-4o-mini",
  apiKey: process.env.LLM_API_KEY,
  baseUrl: process.env.LLM_BASE_URL,
  systemPrompt:
    process.env.AGENT_SYSTEM_PROMPT ||
    "You are a helpful AI assistant integrated with Eidos. Be concise, friendly, and helpful.",
}

if (!agentConfig.apiKey) {
  console.warn(
    `⚠️ Warning: LLM_API_KEY is not set. The agent may not work properly.`
  )
}

// Create a mock space manager for CLI mode (no space functionality)
const mockSpaceManager: SpaceManagerInterface = {
  getAllSpaces: () => [],
  getSpace: () => null,
}

// Start the bot
const botPromise = startTelegramBot({
  botToken: BOT_TOKEN,
  agentConfig,
  sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || "30"),
  spaceManager: mockSpaceManager,
})

// Graceful shutdown
process.on("SIGINT", async () => {
  const bot = await botPromise
  await bot.stop()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  const bot = await botPromise
  await bot.stop()
  process.exit(0)
})
