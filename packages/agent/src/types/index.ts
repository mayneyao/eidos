import type { SpaceInfo } from "@eidos.space/space-manager"

/**
 * Platform-agnostic message interface
 */
export interface Message {
  id: string
  content: string
  userId: string
  username?: string
  firstName?: string
  timestamp: number
}

/**
 * Platform adapter interface
 * Each messaging platform (Telegram, Discord, etc.) should implement this
 */
export interface PlatformAdapter {
  /**
   * Platform name (e.g., "telegram", "discord")
   */
  readonly name: string

  /**
   * Start the platform bot
   */
  start(): Promise<void>

  /**
   * Stop the platform bot
   */
  stop(): Promise<void>

  /**
   * Send a message to a user
   */
  sendMessage(userId: string, content: string): Promise<void>

  /**
   * Edit/update an existing message
   */
  updateMessage(
    userId: string,
    messageId: string,
    content: string
  ): Promise<void>

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): void

  /**
   * Register a command handler
   */
  onCommand(command: string, handler: CommandHandler): void
}

/**
 * Message handler function
 */
export type MessageHandler = (message: Message) => Promise<void>

/**
 * Command handler function
 */
export type CommandHandler = (message: Message, args?: string[]) => Promise<void>

/**
 * User session data for managing conversations
 */
export interface UserSession {
  userId: string
  username?: string
  firstName?: string
  lastActivity: number
  messageCount: number
  /**
   * Currently selected space for this user
   */
  currentSpace?: SpaceInfo
}

/**
 * REPL execution configuration
 */
export interface ReplConfig {
  /** Execute JS in renderer and return result */
  executeInRenderer: (code: string) => Promise<any>
  /** Save script to space file system */
  saveScript: (path: string, content: string) => Promise<void>
}

/**
 * Agent configuration options
 */
export interface AgentConfig {
  provider: string
  model: string
  systemPrompt: string
  apiKey?: string
  baseUrl?: string
  /** REPL execution helpers for browser sandbox */
  replConfig?: ReplConfig
  /**
   * API format type.
   * - "openai-completions": OpenAI compatible API format (default)
   * - "anthropic-messages": Anthropic Messages API format
   * If not specified, will be auto-detected based on provider.
   */
  apiType?: "openai-completions" | "anthropic-messages"
}

/**
 * Environment configuration
 */
export interface EnvConfig {
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  AGENT_SYSTEM_PROMPT?: string
  SESSION_TIMEOUT_MINUTES?: string
}

/**
 * Platform-specific configuration
 */
export interface PlatformConfig {
  telegram?: {
    botToken: string
  }
  discord?: {
    botToken: string
    clientId: string
  }
}

/**
 * Space manager interface for agent integration
 * Provides access to space operations without direct dependency on space-manager package
 */
export interface SpaceManagerInterface {
  /**
   * Get all available spaces
   */
  getAllSpaces(): SpaceInfo[]
  /**
   * Get a specific space by ID
   */
  getSpace(id: string): SpaceInfo | null
}
