import type { FileSpaceAgentEvent, FileSpaceAgentMessage } from "./types"

function cloneMessage(message: FileSpaceAgentMessage): FileSpaceAgentMessage {
  return {
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
    metadata: message.metadata ? { ...message.metadata } : undefined,
  }
}

/**
 * Reconstruct the UI-message model used by the mature Agent components from
 * the durable semantic file-Space event journal.
 */
export function buildFileSpaceAgentMessages(
  events: FileSpaceAgentEvent[]
): FileSpaceAgentMessage[] {
  let messages: FileSpaceAgentMessage[] = []

  for (const event of events) {
    switch (event.type) {
      case "message.created":
        messages.push({
          id: event.data.id,
          role: "user",
          parts: [{ type: "text", text: event.data.text }],
          metadata: event.data.metadata,
        })
        break
      case "message.snapshot": {
        const index = messages.findIndex(
          (message) => message.id === event.data.message.id
        )
        const snapshot = cloneMessage(event.data.message)
        if (index === -1) messages.push(snapshot)
        else messages[index] = snapshot
        break
      }
      case "conversation.truncated": {
        const targetIndex = messages.findIndex(
          (message) => message.id === event.data.targetMessageId
        )
        if (targetIndex !== -1) {
          messages = messages.slice(0, targetIndex)
          if (event.data.replacement) {
            messages.push(cloneMessage(event.data.replacement))
          }
        }
        break
      }
    }
  }

  return messages
}
