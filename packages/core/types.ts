import type { LanguageModelUsage } from "ai"

export type { LanguageModelUsage }

/**
 * Message metadata details
 * Contains timestamp, model info, token usage, etc.
 */
export interface MessageMetadata {
  /** Message creation timestamp (ms) */
  createdAt: number
  /** The model ID used */
  model: string
  /** Full token usage info from LanguageModelUsage (includes cache, reasoning details, etc.) */
  tokens?: LanguageModelUsage
  /** Time spent generating (ms) */
  duration?: number
  /** Finish reason of the generation */
  finishReason?: string
  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>
}
