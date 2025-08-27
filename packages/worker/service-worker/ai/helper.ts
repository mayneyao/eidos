import type { CoreAssistantMessage, CoreToolMessage, LanguageModelV1, UIMessage, CoreMessage } from '@/packages/ai/index';
import { generateText } from '@/packages/ai/index';


// import { queryEmbedding } from "../routes/lib"
import type { DataSpace } from "@/packages/core/DataSpace";
import type { ChatMessage } from '@/packages/core/meta-table/message';


export function getMostRecentUserMessage(messages: Array<CoreMessage>) {
    const userMessages = messages.filter((message) => message.role === 'user');
    return userMessages.at(-1);
}

export async function getChatById(id: string, dataspace: DataSpace) {
    const chat = await dataspace.chat.get(id)
    return chat
}

export async function getMessagesByChatId(id: string, dataspace: DataSpace) {
    const messages = await dataspace.message.list({ chat_id: id }, {
        orderBy: "created_at",
        order: "ASC"
    })
    return messages
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getTrailingMessageId({
    messages,
}: {
    messages: Array<ResponseMessage>;
}): string | null {
    const trailingMessage = messages.at(-1);

    if (!trailingMessage) return null;

    return trailingMessage.id;
}



export async function saveChat(data: { id: string, title?: string, projectId?: string }, dataspace: DataSpace) {
    await dataspace.chat.add({ id: data.id, title: data.title, project_id: data.projectId })
}
export async function updateChatTitle(id: string, title: string, dataspace: DataSpace) {
    await dataspace.chat.set(id, { title })
}


async function createOrUpdateMessage(message: ChatMessage, dataspace: DataSpace) {
    const existingMessage = await dataspace.message.get(message.id)
    if (existingMessage) {
        await dataspace.message.set(message.id, message)
    } else {
        await dataspace.message.add(message)
    }
}

export async function saveMessages(messages: { messages: ChatMessage[] }, dataspace: DataSpace) {
    try {
        const message = messages.messages[0]
        await createOrUpdateMessage(message, dataspace)
    } catch (error) {
        // throw new Error('Failed to save messages');
        console.error('Failed to save messages', error)
    }
}

export const combineAssistantMessage = (
    uiMessage: UIMessage,
    message: ResponseMessage
): {
    id: string;
    role: string;
    content: any;
    parts: any[];
} => {
    if (uiMessage.role === 'assistant' && message.role === 'assistant') {
        return {
            id: uiMessage.id,
            role: uiMessage.role,
            content: uiMessage.content,
            parts: [...uiMessage.parts, ...message.content],
        }
    }
    throw new Error('Invalid message role')
}
export async function updateMessage(message: ChatMessage, dataspace: DataSpace) {
    await dataspace.message.set(message.id, message)
}

export async function getChatMessages(id: string, dataspace: DataSpace) {
    const messages = await dataspace.message.list({ chat_id: id }, {
        orderBy: "created_at",
        order: "ASC"
    })
    return messages
}

export async function deleteMessages(messageIds: string[], dataspace: DataSpace) {
    await dataspace.message.deleteByIds(messageIds)
}

export async function getLastAssistantMessage(chatId: string, dataspace: DataSpace) {
    const messages = await dataspace.message.list({ chat_id: chatId, role: "assistant" }, {
        orderBy: "created_at",
        order: "DESC"
    })
    return messages[0]
}

/**
 * Check if the current request is a reload scenario
 * A reload scenario is when the frontend sends the original conversation but removes the last assistant message
 */
export async function isReloadScenario(messages: ChatMessage[], dataspace: DataSpace, chatId: string): Promise<boolean> {
    const dbMessages = await getChatMessages(chatId, dataspace);
    if (dbMessages.length === 0) return false;

    const lastDbMessage = dbMessages[dbMessages.length - 1];
    // If last message in DB is not an assistant message, not a reload case
    if (lastDbMessage.role !== 'assistant') return false;

    const hasLastAssistantMessage = messages.some(msg =>
        msg.role === 'assistant' && msg.content === lastDbMessage.content
    );
    // It's a reload if the last assistant message is missing
    return !hasLastAssistantMessage;
}

export async function generateTitleFromUserMessage({
    message,
    model,
}: {
    message: UIMessage;
    model: LanguageModelV1;
}) {
    const { text: title } = await generateText({
        model: model,
        system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
        prompt: JSON.stringify(message),
    });

    return title;
}

export function sanitizeResponseMessages(
    messages: Array<CoreToolMessage | CoreAssistantMessage>,
): Array<CoreToolMessage | CoreAssistantMessage> {
    const toolResultIds: Array<string> = [];

    for (const message of messages) {
        if (message.role === 'tool') {
            for (const content of message.content) {
                if (content.type === 'tool-result') {
                    toolResultIds.push(content.toolCallId);
                }
            }
        }
    }

    const messagesBySanitizedContent = messages.map((message) => {
        if (message.role !== 'assistant') return message;

        if (typeof message.content === 'string') return message;

        const sanitizedContent = message.content.filter((content) =>
            content.type === 'tool-call'
                ? toolResultIds.includes(content.toolCallId)
                : content.type === 'text'
                    ? content.text.length > 0
                    : true,
        );

        return {
            ...message,
            content: sanitizedContent,
        };
    });

    return messagesBySanitizedContent.filter(
        (message) => message.content.length > 0,
    );
}