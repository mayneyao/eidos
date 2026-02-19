"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useChat } from "@ai-sdk/react"
import type { ChatRequestOptions, UIMessage, CreateUIMessage } from "ai"
import { AnimatePresence } from "framer-motion"
import { useSWRConfig } from "swr"
import { useWindowSize } from "usehooks-ts"

import { useToast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"
import { useRemixPrompt } from "@/apps/web-app/pages/[database]/extensions/hooks/use-remix-prompt"
import { useEditorStore } from "@/apps/web-app/pages/[database]/extensions/stores/editor-store"

import { getPromptByExtensionType } from "../ai-chat/hooks/use-system-prompt"
import type { UIBlock } from "./components/block"
import { BlockStreamHandler } from "./components/block-stream-handler"
import { PreviewMessage, ThinkingMessage } from "./components/message"
import { MultimodalInput } from "./components/multimodal-input"
import { Overview } from "./components/overview"
import { useScrollToBottom } from "./components/use-scroll-to-bottom"
import type { Vote } from "./interface"

// Define local Attachment interface since it's not exported from ai in v6
interface Attachment {
  name: string;
  contentType: string;
  url: string;
}

export function Chat({
  id,
  scriptId,
  initialMessages,
  selectedModelId,
}: {
  id: string
  scriptId: string
  initialMessages: Array<UIMessage>
  selectedModelId: string
}) {
  const { mutate } = useSWRConfig()
  const {
    codingModel,
    getConfigByModel,
    findFirstAvailableModel,
    textModelConfig,
  } = useAiConfig()
  const script = useMblock(scriptId)
  const [remixPrompt, setRemixPrompt] = useState("")
  const { getRemixPrompt } = useRemixPrompt()
  // Custom prompts are no longer supported
  const [selectedCustomPromptId, setSelectedCustomPromptId] = useState<
    string | null
  >(null)
  const { setChatHistory } = useEditorStore()
  const { toast } = useToast()

  // Local state for input since useChat no longer provides input/setInput
  const [input, setInput] = useState("")

  useEffect(() => {
    // Custom prompts are no longer supported, always use default prompt
    const basePrompt = getPromptByExtensionType(script?.type)

    getRemixPrompt(basePrompt, {
      bindings: script?.bindings as Record<
        string,
        { type: "table"; value: string }
      >,
      userCode: script?.ts_code || script?.code,
      useSdk: true,
      useUiGuide: true,
    }).then(setRemixPrompt)
  }, [
    script?.bindings,
    script?.ts_code,
    script?.code,
    script?.type,
    getRemixPrompt,
  ])
  const [aiModel, setAIModel] = useState(
    codingModel ?? findFirstAvailableModel()
  )

  const config = useMemo(() => {
    try {
      return getConfigByModel(aiModel)
    } catch (error) {
      return {}
    }
  }, [aiModel, getConfigByModel])

  const { space } = useCurrentPathInfo()
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
  } = useChat({
    messages: initialMessages,
    onFinish: () => {
      setMessages((currentMessages) => {
        console.log("messages:", currentMessages)
        setChatHistory(currentMessages)
        return currentMessages
      })
    },
    onError: (error: Error) => {
      console.error("Chat error:", error)
      toast({
        title: "Error",
        description: error.message || "An error occurred during the chat",
        variant: "destructive",
      })
    },
  })

  // Compute isLoading from status
  const isLoading = status === "submitted" || status === "streaming"

  // Handle submit using sendMessage
  const myHandleSubmit = useCallback(
    (
      event?: {
        preventDefault?: () => void
      },
      chatRequestOptions?: ChatRequestOptions
    ) => {
      event?.preventDefault?.()
      if (!input.trim()) return

      sendMessage(
        {
          role: "user",
          parts: [{ type: "text" as const, text: input }],
        },
        chatRequestOptions
      )
      setInput("")
    },
    [input, sendMessage]
  )

  const { width: windowWidth = 1920, height: windowHeight = 1080 } =
    useWindowSize()

  const [block, setBlock] = useState<UIBlock>({
    documentId: "init",
    content: "",
    title: "",
    status: "idle",
    isVisible: false,
    boundingBox: {
      top: windowHeight / 4,
      left: windowWidth / 4,
      width: 250,
      height: 50,
    },
  })

  // const { data: votes } = useSWR<Array<Vote>>(`/api/vote?chatId=${id}`, fetcher)
  const votes: Array<Vote> = []

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>()

  const [attachments, setAttachments] = useState<Array<Attachment>>([])

  const handleRegenerate = useCallback(async () => {
    await regenerate()
  }, [regenerate])

  // Wrapper for append to match the expected signature
  const append = useCallback(
    async (message: any, options?: ChatRequestOptions): Promise<string | null | undefined> => {
      // Convert message to v6 format with parts
      const parts = message.parts || [{ type: "text" as const, text: message.content || "" }];
      await sendMessage({
        role: message.role,
        parts,
      }, options)
      return null
    },
    [sendMessage]
  )

  return (
    <>
      <div className="flex flex-col min-w-0 h-full bg-background relative">
        <div
          ref={messagesContainerRef}
          className="flex flex-col min-w-0 gap-6 flex-1 pt-4 pb-[120px]"
        >
          {messages.length === 0 && <Overview aiModel={aiModel} />}

          {messages.map((message, index) => (
            <PreviewMessage
              key={message.id}
              chatId={id}
              projectId={scriptId}
              message={message}
              block={block}
              setBlock={setBlock}
              isLoading={isLoading && messages.length - 1 === index}
              vote={votes?.find((vote) => vote.messageId === message.id)}
              onRegenerate={handleRegenerate}
              isLastMessage={index === messages.length - 1}
            />
          ))}

          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <ThinkingMessage />
            )}

          <div
            ref={messagesEndRef}
            className="flex-shrink-0 h-32 w-6"
            aria-hidden="true"
          />
        </div>

        <form className="flex mx-auto px-4 pb-4 md:pb-6 gap-2 w-full md:max-w-3xl sticky bottom-0 inset-x-0 bg-background">
          <MultimodalInput
            chatId={id}
            type={script?.type ?? "script"}
            input={input}
            setInput={setInput}
            handleSubmit={myHandleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            setMessages={setMessages}
            append={append}
            aiModel={aiModel}
            setAIModel={setAIModel}
            prompts={[]}
            selectedCustomPromptId={selectedCustomPromptId}
            setSelectedCustomPromptId={setSelectedCustomPromptId}
          />
        </form>
      </div>

      <BlockStreamHandler setBlock={setBlock} streamingData={undefined} />
    </>
  )
}

export default Chat
