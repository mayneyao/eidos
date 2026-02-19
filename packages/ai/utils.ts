import type {
    UIMessage, isToolUIPart
} from 'ai';

// Re-export isToolUIPart for convenience
export { isToolUIPart } from 'ai';

/**
 * @deprecated Annotations are no longer part of UIMessage in the new AI SDK. 
 * This function is kept for backward compatibility but always returns message.id.
 */
export function getMessageIdFromAnnotations(message: UIMessage) {
    // New AI SDK uses a different mechanism for tracking server-side IDs
    // Return the message id directly
    return message.id;
}

/**
 * Sanitizes UI messages by removing incomplete tool calls when a message is stopped.
 * This ensures that when a generation is stopped, we only keep tool calls that have results.
 */
export function sanitizeUIMessages(messages: Array<UIMessage>): Array<UIMessage> {
    const messagesBySanitizedToolInvocations = messages.map((message) => {
        if (message.role !== 'assistant') return message;

        // Filter parts to only include completed tool calls or non-tool parts
        const sanitizedParts = message.parts.filter((part) => {
            // Keep non-tool parts as-is
            // Tool parts are either 'dynamic-tool' or 'tool-${toolName}' pattern
            const isToolPart = part.type === 'dynamic-tool' || part.type.startsWith('tool-');
            if (!isToolPart) {
                return true;
            }
            
            // For tool parts, only keep those that have results (completed)
            const toolPart = part as any;
            if (toolPart.state === 'result') {
                return true;
            }
            
            // Filter out incomplete tool calls
            return false;
        });

        return {
            ...message,
            parts: sanitizedParts,
        };
    });

    // Filter out messages that have no content after sanitization
    return messagesBySanitizedToolInvocations.filter((message) => {
        // Keep messages with non-empty parts
        if (message.parts.length > 0) {
            // Check if there's any text content or completed tool calls
            const hasContent = message.parts.some((part) => {
                if (part.type === 'text') {
                    return (part as any).text?.length > 0;
                }
                return true; // Keep other part types (files, completed tools, etc.)
            });
            return hasContent;
        }
        return false;
    });
}
