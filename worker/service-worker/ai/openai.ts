import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from '@ai-sdk/deepseek';
import { CoreTool, CoreUserMessage, LanguageModelV1, convertToCoreMessages, streamText } from "ai";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { allFunctions } from "@/lib/ai/functions";

// import { queryEmbedding } from "../routes/lib"
import { isDesktopMode } from "@/lib/env";
import { uuidv7 } from "@/lib/utils";
import { DataSpace } from "@/worker/web-worker/DataSpace";
import { ChatMessage } from "@/worker/web-worker/meta-table/message";
import { generateTitleFromUserMessage, getChatById, getMostRecentUserMessage, saveChat, saveMessages, updateChatTitle } from "./helper";
import { IData } from "./interface";

function getProvider(data: {
  apiKey?: string,
  baseUrl?: string,
  type: IData['type']

}) {
  const { apiKey, baseUrl, type = 'openai' } = data
  const config: any = {
    apiKey
  }
  if (baseUrl) {
    config.baseUrl = baseUrl
  }
  switch (type) {
    case 'deepseek':
      return createDeepSeek(config)
    case 'openai':
      return createOpenAI(config)
    default:
      return createOpenAICompatible({
        baseURL: baseUrl,
        apiKey
      })
  }
}

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

  let request: Parameters<typeof streamText>[0] = {
    model: llmodel,
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
  console.log("request", JSON.stringify(request, null, 2))
  const result = streamText(request)
  return result.toDataStreamResponse()
}
