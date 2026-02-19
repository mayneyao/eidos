import { getProvider } from "@/packages/ai/helper";
import type { LanguageModel, UIMessage, Tool, ModelMessage } from "@/packages/ai/index";
import { extractReasoningMiddleware, jsonSchema, smoothStream, streamText, wrapLanguageModel } from "@/packages/ai/index";


// import { queryEmbedding } from "../routes/lib"
import { uuidv7 } from "@/lib/utils";
import type { DataSpace } from "@/packages/core/data-space";
import type { ChatMessage } from "@/packages/core/meta-table/message";
import { combineAssistantMessage, deleteMessages, generateTitleFromUserMessage, getChatById, getMessagesByChatId, getTrailingMessageId, saveChat, saveMessages, updateChatTitle } from "./helper";
import type { IData } from "./interface";



/**
 * handle chat api for frontend, use with `useChat` hook in ai sdk
 * @param data 
 * @param ctx 
 * @returns 
 */
export async function handleChatApi(
  data: IData,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
) {
  const {
    message,
    messages: clientMessages,
    apiKey,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    // currentPreviewFile,
    space,
    id,
    projectId,
    textModel,
    tools,
    chunking = 'line'
  } = data
  // console.log("data", data)
  // console.log("message", message)
  // now tools defined in `tools` field will be used, It comes from `useChat` hook in ai sdk
  const _tools: Record<string, Tool> = {}

  Object.entries(tools ?? {}).forEach(([key, value]) => {
    _tools[key] = {
      inputSchema: jsonSchema((value as any)?.inputSchema || {}),
    } as Tool
  })

  const model = modelAndProvider.split("@")[0]
  const provider = getProvider({
    apiKey,
    baseUrl,
    type: data.type
  })

  console.log("clientMessages", clientMessages)
  const dataspace = space && await ctx?.getDataspace(space)

  const llmodelForTextTask = textModel && getProvider({
    apiKey: textModel.apiKey,
    baseUrl: textModel.baseUrl,
    type: textModel.type
  })(textModel.modelId.split("@")[0]) as LanguageModel

  const llmodel = provider(model ?? "gpt-3.5-turbo-0125") as any

  let messages: ModelMessage[] = clientMessages as any
  if (dataspace) {
    const previousMessages = await getMessagesByChatId(id, dataspace);

    // Simple message append for v6 compatibility
    messages = [...previousMessages as any, message] as ModelMessage[];

    const messageIndex = previousMessages.findIndex(m => m.id === message.id)
    const isReload = messageIndex !== -1
    const messageIdsToDelete = previousMessages.slice(messageIndex + 1).map(m => m.id)
    if (isReload && messageIdsToDelete.length > 0) {
      console.log("deleteMessages", messageIdsToDelete)
      await deleteMessages(messageIdsToDelete, dataspace)
    }

    const chat = await getChatById(id, dataspace);
    const getTitle = () => {
      if (llmodelForTextTask) {
        try {
          return generateTitleFromUserMessage({ message: message as any, model: llmodelForTextTask })
        } catch (error) {
          console.error("Failed to generate title", error)
          return 'error generating title'
        }
      }
      return 'untitle'
    }

    if (!chat) {
      const title = await getTitle();
      await saveChat({ id, projectId, title }, dataspace);
    }
    if (!chat?.title) {
      const title = await getTitle();
      await updateChatTitle(id, title, dataspace);
    }

    await saveMessages({
      messages: [
        {
          id: message.id,
          chat_id: id,
          content: message.content,
          role: message.role,
          parts: (message as any).parts,
        } as ChatMessage,
      ],
    }, dataspace);

  }

  // Use streamText with toUIMessageStreamResponse pattern for v6
  const result = streamText({
    model: wrapLanguageModel({
      model: llmodel,
      middleware: extractReasoningMiddleware({ tagName: 'think' })
    }) as any,
    system: systemPrompt,
    experimental_transform: smoothStream({
      delayInMs: 20,
      chunking
    }),
    messages: messages,
    tools: _tools,
    onFinish: async ({ response }: { response: any }) => {
      try {
        if (!dataspace) {
          return;
        }
        const assistantId = getTrailingMessageId({
          messages: response.messages.filter(
            (message: any) => message.role === 'assistant',
          ) as any,
        });
        console.log("assistantId", assistantId)

        if (!assistantId) {
          throw new Error('No assistant message found!');
        }

        // Simple message append for v6 compatibility
        const assistantMessage = response.messages[response.messages.length - 1];

        if (!assistantMessage || assistantMessage.role !== 'assistant') {
          const combinedMessage = combineAssistantMessage(message as any, response.messages[0] as any)
          await saveMessages({
            messages: [
              {
                id: combinedMessage.id,
                chat_id: id,
                role: 'assistant',
                content: combinedMessage.content,
                parts: combinedMessage.parts as any,
              },
            ],
          }, dataspace);
          return;
        }
        await saveMessages({
          messages: [
            {
              id: assistantId,
              chat_id: id,
              content: (assistantMessage as any).content,
              role: assistantMessage.role,
              parts: (assistantMessage as any).parts,
            },
          ],
        }, dataspace);
      } catch (error) {
        console.error('Failed to save chat');
      }
    },
  } as any)

  // Return the response using toUIMessageStreamResponse pattern
  return result.toUIMessageStreamResponse({
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
