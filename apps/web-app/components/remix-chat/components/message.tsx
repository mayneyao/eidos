"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import type { Message } from "ai"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

import type { Vote } from "../interface"
import type { UIBlock } from "./block"
import { SparklesIcon } from "./icons"
import { Markdown } from "./markdown"
import { MessageActions } from "./message-actions"
import { MessageReasoning } from "./message-reasoning"
import { PreviewAttachment } from "./preview-attachment"
import { ToolCallResult } from "./tool-call-result"
import { ToolCallSkeleton } from "./tool-call-skeleton"

export const PreviewMessage = ({
  chatId,
  projectId,
  message,
  block,
  setBlock,
  vote,
  isLoading,
  onRegenerate,
  isLastMessage,
}: {
  chatId: string
  projectId: string
  message: Message
  block: UIBlock
  setBlock: Dispatch<SetStateAction<UIBlock>>
  vote: Vote | undefined
  isLoading: boolean
  onRegenerate?: () => void
  isLastMessage?: boolean
}) => {
  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-role={message.role}
      data-message-role={message.role}
    >
      <div
        className={cn(
          "group-data-[role=user]/message:bg-primary group-data-[role=user]/message:text-primary-foreground flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl"
        )}
      >
        {message.role === "assistant" && (
          <div className="relative size-8 shrink-0">
            {isLoading && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full animate-spin-slow" />
            )}
            <div
              className={cn(
                "absolute inset-0 bg-background rounded-full flex items-center justify-center",
                isLoading ? "inset-[2px]" : "ring-1 ring-border"
              )}
            >
              <SparklesIcon size={14} />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 w-full min-w-0">
          {message.parts?.map((part, index) => {
            const { type } = part
            const key = `message-${message.id}-part-${index}`

            if (type === "reasoning") {
              return (
                <MessageReasoning
                  key={key}
                  isLoading={isLoading}
                  reasoning={part.reasoning}
                />
              )
            }

            if (type === "tool-invocation") {
              const { toolInvocation } = part
              const { toolName, toolCallId, state } = toolInvocation

              if (state === "call") {
                const { args } = toolInvocation
                return (
                  <ToolCallSkeleton
                    key={toolCallId}
                    toolName={toolName}
                    toolCallId={toolCallId}
                    args={args}
                  />
                )
              }

              if (state === "result") {
                const { result } = toolInvocation
                const { toolName, toolCallId, args } = toolInvocation

                return (
                  <ToolCallResult
                    key={toolCallId}
                    toolName={toolName}
                    toolCallId={toolCallId}
                    args={args}
                    result={result}
                    block={block}
                    setBlock={setBlock}
                  />
                )
              }
            }

            if (type === "text") {
              return (
                <div
                  className={cn(
                    "flex flex-col gap-4 w-full",
                    message.role === "user" ? "break-all" : "break-words"
                  )}
                >
                  <div className="w-full [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:rounded-lg">
                    <Markdown>{part.text as string}</Markdown>
                  </div>
                </div>
              )
            }
          })}
          {message.experimental_attachments && (
            <div className="flex flex-row gap-2">
              {message.experimental_attachments.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={attachment}
                />
              ))}
            </div>
          )}

          <MessageActions
            key={`action-${message.id}`}
            chatId={chatId}
            projectId={projectId}
            message={message}
            vote={vote}
            isLoading={isLoading}
            onRegenerate={onRegenerate}
            isLastMessage={isLastMessage}
          />
        </div>
      </div>
    </motion.div>
  )
}

export const ThinkingMessage = () => {
  const role = "assistant"

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 0.3 } }}
      data-role={role}
      data-message-role={role}
    >
      <div
        className={cn(
          "flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl"
        )}
      >
        <div className="relative size-8 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full animate-spin-slow" />
          <div className="absolute inset-[2px] bg-background rounded-full flex items-center justify-center">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Thinking</span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 1, 0],
                transition: {
                  repeat: Infinity,
                  duration: 1.5,
                  ease: "easeInOut",
                },
              }}
            >
              ...
            </motion.span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
