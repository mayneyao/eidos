import { getProvider } from "@/packages/ai/helper";
import type { LanguageModelV1, Message, Tool } from "@/packages/ai/index";
import { appendClientMessage, appendResponseMessages, createDataStreamResponse, extractReasoningMiddleware, jsonSchema, smoothStream, streamText, wrapLanguageModel } from "@/packages/ai/index";


// import { queryEmbedding } from "../routes/lib"
import { uuidv7 } from "@/lib/utils";
import type { DataSpace } from "@/packages/core/DataSpace";
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
      parameters: jsonSchema(value?.parameters as object),
    }
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
  })(textModel.modelId.split("@")[0]) as LanguageModelV1

  const llmodel = provider(model ?? "gpt-3.5-turbo-0125") as LanguageModelV1

  let messages: Message[] = clientMessages
  if (dataspace) {
    const previousMessages = await getMessagesByChatId(id, dataspace);

    messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

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
          return generateTitleFromUserMessage({ message, model: llmodelForTextTask })
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
          parts: message.parts,
        } as ChatMessage,
      ],
    }, dataspace);

  }


  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({
    execute: dataStream => {
      dataStream.writeData('initialized call');
      const result = streamText({
        model: wrapLanguageModel({
          model: llmodel,
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        }),
        system: systemPrompt,
        experimental_transform: smoothStream({
          delayInMs: 20,
          chunking
        }),
        experimental_generateMessageId: uuidv7,
        messages: messages,
        tools: _tools,
        onFinish: async ({ response }) => {
          try {
            if (!dataspace) {
              return;
            }
            const assistantId = getTrailingMessageId({
              messages: response.messages.filter(
                (message) => message.role === 'assistant',
              ),
            });
            console.log("assistantId", assistantId)

            if (!assistantId) {
              throw new Error('No assistant message found!');
            }

            let [, assistantMessage] = appendResponseMessages({
              messages: [message],
              responseMessages: response.messages,
            });

            if (!assistantMessage) {
              const combinedMessage = combineAssistantMessage(message, response.messages[0])
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
                  content: assistantMessage.content,
                  role: assistantMessage.role,
                  parts: assistantMessage.parts,
                },
              ],
            }, dataspace);
          } catch (error) {
            console.error('Failed to save chat');
          }
        },
      })
      result.consumeStream();
      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true
      });
    },

    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });

}
