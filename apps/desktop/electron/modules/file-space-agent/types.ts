export type FileSpaceAgentRunStatus =
  | "queued"
  | "running"
  | "waiting-approval"
  | "succeeded"
  | "failed"
  | "canceled"
  | "interrupted"

export type FileSpaceAgentToolStatus =
  | "running"
  | "waiting-approval"
  | "approved"
  | "succeeded"
  | "failed"
  | "denied"
  | "canceled"
  | "interrupted"
  | "outcome-unknown"

export type FileSpaceAgentApprovalMode = "ask" | "auto-safe" | "full-access"

export const FILE_SPACE_AGENT_FORMAT_VERSION = 2
export const FILE_SPACE_AGENT_EVENT_SCHEMA_VERSION = 2

export interface FileSpaceAgentConversation {
  formatVersion: number
  id: string
  /** Local registry IDs are not portable and are never persisted by the store. */
  spaceId?: string
  title: string
  model: string
  /** @deprecated Approval authority lives under .eidos/agent/local. */
  approvalMode?: FileSpaceAgentApprovalMode
  thinking?: FileSpaceAgentThinkingLevel
  skills?: string[]
  parentId?: string
  forkedMessageId?: string
  /** Main-process activity projection. Never persisted in meta.json. */
  latestRunStatus?: FileSpaceAgentRunStatus
  /** Main-process activity projection. Never persisted in meta.json. */
  pendingApprovalCount?: number
  /** Main-process activity projection. Never persisted in meta.json. */
  pendingApprovalTitle?: string
  createdAt: string
  updatedAt: string
}

export type FileSpaceAgentThinkingLevel = "off" | "low" | "medium" | "high"

export interface FileSpaceAgentMention {
  id: string
  name: string
  type: string
}

export interface FileSpaceAgentMessageMetadata {
  createdAt: number
  model: string
  duration?: number
  tokens?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export interface FileSpaceAgentMessagePart {
  type: string
  [key: string]: unknown
}

export interface FileSpaceAgentMessage {
  id: string
  role: "user" | "assistant"
  parts: FileSpaceAgentMessagePart[]
  metadata?: FileSpaceAgentMessageMetadata
}

export interface FileSpaceAgentResourceContextInput {
  sourceUrl?: string
  selection?: string
}

export interface FileSpaceAgentResourceContext {
  kind: "markdown" | "text" | "image" | "binary" | "base" | "base-row"
  path: string
  heading?: string
  tableId?: string
  rowId?: string
  selection?: string
  excerpt?: string
  contentDigest?: string
  baseFingerprint?: string
  mtimeMs?: number
  mediaType?: string
  size?: number
  capturedAt: string
  reason: "active-tab" | "selection"
}

export interface FileSpaceAgentRun {
  id: string
  conversationId: string
  messageId: string
  status: FileSpaceAgentRunStatus
  model: string
  createdAt: string
  updatedAt: string
  error?: string
}

export interface FileSpaceAgentToolRun {
  id: string
  runId: string
  toolCallId?: string
  name:
    | "web.search"
    | "web.fetch"
    | "space.files.list"
    | "space.files.search"
    | "space.files.readText"
    | "space.files.createText"
    | "space.files.createDirectory"
    | "space.files.writeText"
    | "space.files.move"
    | "space.files.delete"
    | "space.base.inspect"
    | "space.base.readRows"
    | "extension.inspect"
    | "extension.create"
    | "extension.uninstall"
    | "extension.trust"
    | "extension.enable"
    | "extension.grant"
    | "extension.command"
    | "version.status"
    | "version.history"
    | "version.commitDetail"
    | "version.conflicts"
    | "version.diff"
    | "version.enable"
    | "version.stage"
    | "version.unstage"
    | "version.commit"
    | "version.discard"
    | "version.restorePath"
    | "version.restore"
    | "version.remotes"
    | "version.configureRemote"
    | "version.removeRemote"
    | "version.fetch"
    | "version.pull"
    | "version.push"
    | "version.resolveConflict"
  title: string
  risk: "observe" | "external" | "modify"
  approvalMode?: FileSpaceAgentApprovalMode
  approval?: "required" | "automatic"
  status: FileSpaceAgentToolStatus
  resource?: string
  inputSummary: string
  preview?: string
  resultSummary?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type FileSpaceAgentEventBody =
  | {
      type: "conversation.created"
      data: { conversation: FileSpaceAgentConversation }
    }
  | {
      type: "message.created"
      data: {
        id: string
        role: "user"
        text: string
        runId: string
        metadata?: FileSpaceAgentMessageMetadata
      }
    }
  | {
      type: "message.snapshot"
      data: { message: FileSpaceAgentMessage; runId?: string }
    }
  | {
      type: "conversation.truncated"
      data: {
        targetMessageId: string
        replacement?: FileSpaceAgentMessage
      }
    }
  | {
      type: "resource.context"
      data: { runId: string; context: FileSpaceAgentResourceContext }
    }
  | {
      type: "run.status"
      data: { run: FileSpaceAgentRun }
    }
  | {
      type: "tool.status"
      data: { tool: FileSpaceAgentToolRun }
    }

export type FileSpaceAgentEvent = FileSpaceAgentEventBody & {
  /** New events always write the current semantic journal schema version. */
  schemaVersion?: number
  sequence: number
  timestamp: string
}

export interface StartFileSpaceAgentRunInput {
  spaceId: string
  conversationId: string
  prompt: string
  model: string
  /** @deprecated Ignored. Change the main-owned local policy explicitly. */
  approvalMode?: FileSpaceAgentApprovalMode
  thinking?: FileSpaceAgentThinkingLevel
  skills?: string[]
  mentions?: FileSpaceAgentMention[]
  /** Re-run from an existing user or assistant message without duplicating it. */
  regenerateFromMessageId?: string
  context?: FileSpaceAgentResourceContextInput
}

export interface StartFileSpaceAgentRunResult {
  run: FileSpaceAgentRun
  conversation: FileSpaceAgentConversation
}

export interface FileSpaceAgentConversationSnapshot {
  conversation: FileSpaceAgentConversation | null
  events: FileSpaceAgentEvent[]
  /** Includes the current Main-owned live message while a run is active. */
  messages?: FileSpaceAgentMessage[]
  activeRun: FileSpaceAgentRun | null
  approvalMode: FileSpaceAgentApprovalMode
}

export type FileSpaceAgentApprovalDecision = "allow-once" | "deny"
