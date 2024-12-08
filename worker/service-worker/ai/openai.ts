import { createOpenAI } from "@ai-sdk/openai";
import { CoreTool, convertToCoreMessages, streamText } from "ai";

import { allFunctions } from "@/lib/ai/functions";

// import { queryEmbedding } from "../routes/lib"
import { isDesktopMode } from "@/lib/env";
import { uuidv7 } from "@/lib/utils";
import { DataSpace } from "@/worker/web-worker/DataSpace";
import { ChatMessage } from "@/worker/web-worker/meta-table/message";
import { getChatById, getMostRecentUserMessage, saveChat, saveMessages } from "./helper";
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
    useTools
  } = data
  if (useTools != null) {
    useFunctions = useTools
  }

  const model = modelAndProvider.split("@")[0]
  const openai = createOpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
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

  if (dataspace) {
    const chat = await getChatById(id, dataspace);
    console.log("userMessage", {
      userMessage,
      space,
      id,
      chat,
    })
    if (!chat) {
      // const title = await generateTitleFromUserMessage({ message: userMessage as CoreUserMessage, model: openai(model ?? "gpt-3.5-turbo-0125") });
      await saveChat({ id, projectId }, dataspace);
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
    model: openai(model ?? "gpt-3.5-turbo-0125"),
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
  return result.toDataStreamResponse()
}
