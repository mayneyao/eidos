'use server';

import { LanguageModelV1, generateText, type CoreUserMessage, CoreToolMessage, CoreAssistantMessage } from 'ai';


import { CoreMessage } from "ai";


// import { queryEmbedding } from "../routes/lib"
import { DataSpace } from "@/worker/web-worker/DataSpace";
import { ChatMessage } from '@/worker/web-worker/meta-table/message';


export function getMostRecentUserMessage(messages: Array<CoreMessage>) {
    const userMessages = messages.filter((message) => message.role === 'user');
    return userMessages.at(-1);
}

export async function getChatById(id: string, dataspace: DataSpace) {
    const chat = await dataspace.chat.get(id)
    return chat
}

export async function saveChat(data: { id: string, title?: string, projectId?: string }, dataspace: DataSpace) {
    await dataspace.chat.add({ id: data.id, title: data.title, project_id: data.projectId })
}

export async function saveMessages(messages: { messages: ChatMessage[] }, dataspace: DataSpace) {
    await dataspace.message.add(messages.messages[0])
}

export async function generateTitleFromUserMessage({
    message,
    model,
}: {
    message: CoreUserMessage;
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