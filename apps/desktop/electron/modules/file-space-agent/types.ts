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

export interface FileSpaceAgentConversation {
  id: string
  spaceId: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  latestSequence: number
}

export interface FileSpaceAgentResourceContextInput {
  sourceUrl?: string
  selection?: string
}

export interface FileSpaceAgentResourceContext {
  kind: "markdown" | "text" | "base" | "base-row"
  path: string
  heading?: string
  tableId?: string
  rowId?: string
  selection?: string
  excerpt?: string
  contentDigest?: string
  baseFingerprint?: string
  mtimeMs?: number
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
  name:
    | "space.files.search"
    | "space.files.readText"
    | "space.files.patchText"
    | "space.base.inspect"
    | "space.base.readRows"
  title: string
  risk: "observe" | "modify"
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
      data: { id: string; role: "user"; text: string; runId: string }
    }
  | {
      type: "assistant.delta"
      data: { messageId: string; runId: string; text: string }
    }
  | {
      type: "assistant.completed"
      data: { messageId: string; runId: string }
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
  sequence: number
  timestamp: string
  previousChecksum: string | null
  checksum: string
}

export interface StartFileSpaceAgentRunInput {
  spaceId: string
  conversationId: string
  prompt: string
  model: string
  context?: FileSpaceAgentResourceContextInput
}

export interface StartFileSpaceAgentRunResult {
  run: FileSpaceAgentRun
  conversation: FileSpaceAgentConversation
}

export interface FileSpaceAgentConversationSnapshot {
  conversation: FileSpaceAgentConversation | null
  events: FileSpaceAgentEvent[]
  activeRun: FileSpaceAgentRun | null
}

export type FileSpaceAgentApprovalDecision = "allow-once" | "deny"
