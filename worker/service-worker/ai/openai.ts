import { getProvider } from "@/lib/ai/helper";
import { CoreTool, CoreUserMessage, LanguageModelV1, convertToCoreMessages, createDataStreamResponse, extractReasoningMiddleware, smoothStream, streamText, wrapLanguageModel } from "ai";

import { allFunctions } from "@/lib/ai/functions";

// import { queryEmbedding } from "../routes/lib"
import { isDesktopMode } from "@/lib/env";
import { uuidv7 } from "@/lib/utils";
import { DataSpace } from "@/worker/web-worker/DataSpace";
import { ChatMessage } from "@/worker/web-worker/meta-table/message";
import { generateTitleFromUserMessage, getChatById, getMostRecentUserMessage, saveChat, saveMessages, updateChatTitle } from "./helper";
import { IData } from "./interface";

export async function handleOpenAI(
  data: IData,
  ctx?: {
    getDataspace: (space: string) => Promise<DataSpace | null>
  }
) {
  // only use functions on desktop app
  let useFunctions = isDesktopMode
  const {
    messages,
    apiKey,
    baseUrl,
    systemPrompt,
    model: modelAndProvider,
    // currentPreviewFile,
    space,
    id,
    projectId,
    useTools,
    textModel
  } = data
  if (useTools != null) {
    useFunctions = useTools
  }

  const model = modelAndProvider.split("@")[0]
  const provider = getProvider({
    apiKey,
    baseUrl,
    type: data.type
  })

  const lastMsg = messages[messages.length - 1]
  let newMsgs = messages
  if (systemPrompt?.length) {
    newMsgs = [
      {
        id: "system",
        role: "system" as const,
        content: systemPrompt,
      },
      ...messages,
    ]
  }

  const coreMessages = convertToCoreMessages(newMsgs);
  const userMessage = getMostRecentUserMessage(coreMessages);
  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const dataspace = space && await ctx?.getDataspace(space)

  const llmodelForTextTask = textModel && getProvider({
    apiKey: textModel.apiKey,
    baseUrl: textModel.baseUrl,
    type: textModel.type
  })(textModel.modelId.split("@")[0]) as LanguageModelV1

  const llmodel = provider(model ?? "gpt-3.5-turbo-0125") as LanguageModelV1
  if (dataspace) {
    const chat = await getChatById(id, dataspace);
    const getTitle = () => {
      if (llmodelForTextTask) {
        return generateTitleFromUserMessage({ message: userMessage as CoreUserMessage, model: llmodelForTextTask })
      }
      return 'untitle'
    }
    console.log("userMessage", {
      userMessage,
      space,
      id,
      chat,
    })
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
        { ...userMessage, id: uuidv7(), chat_id: id } as ChatMessage,
      ],
    }, dataspace);
  }

  const _tools: Record<string, CoreTool> = {}
  allFunctions.forEach((f) => {
    _tools[f.name] = {
      description: f.description,
      parameters: f.schema
    }
  })
  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({
    execute: dataStream => {
      dataStream.writeData('initialized call');
      let request: Parameters<typeof streamText>[0] = {
        model: wrapLanguageModel({
          model: llmodel,
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        }),
        experimental_transform: smoothStream({
          delayInMs: 20,
          chunking: 'line'
        }),
        messages: coreMessages,
        onFinish: async ({ text }) => {
          try {
            if (dataspace) {
              await saveMessages({
                messages: [{
                  id: uuidv7(),
                  chat_id: id,
                  role: "assistant",
                  content: text,
                }],
              }, dataspace);
            }
          } catch (error) {
            console.error('Failed to save chat');
          }
        },
      }
      if (useFunctions) {
        request = {
          ...request,
          tools: _tools,
          toolChoice: "auto",
        }
      }
      const result = streamText(request)
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
