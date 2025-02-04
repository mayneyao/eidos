"use client"

import type { Dispatch, SetStateAction } from "react"
import type { Message } from "ai"
import cx from "classnames"
import { motion } from "framer-motion"
import { BookOpenTextIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useState } from "react"

import type { Vote } from "../interface"
import type { UIBlock } from "./block"
import { DocumentToolCall, DocumentToolResult } from "./document"
import { SparklesIcon } from "./icons"
import { Markdown } from "./markdown"
import { MessageActions } from "./message-actions"
import { PreviewAttachment } from "./preview-attachment"
import { Weather } from "./weather"

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
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  
  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-role={message.role}
      data-message-role={message.role}
    >
      <div
        className={cx(
          "group-data-[role=user]/message:bg-primary group-data-[role=user]/message:text-primary-foreground flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl"
        )}
      >
        {message.role === "assistant" && (
          <div className="relative size-8 shrink-0">
            {isLoading && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full animate-spin-slow" />
            )}
            <div
              className={cx(
                "absolute inset-0 bg-background rounded-full flex items-center justify-center",
                isLoading ? "inset-[2px]" : "ring-1 ring-border"
              )}
            >
              <SparklesIcon size={14} />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 w-full min-w-0">
          {message.reasoning && (
            <div 
              className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 border border-border/50 cursor-pointer"
              onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
            >
              <div className="flex items-center gap-2 mb-1.5 text-xs uppercase tracking-wider font-medium">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    transition: { duration: 2, repeat: Infinity }
                  }}
                >
                  💭
                </motion.div>
                Thought Process
                <span className="ml-auto text-xs">
                  {isReasoningExpanded ? '▼' : '▶'}
                </span>
              </div>
              <div 
                className={cx(
                  "leading-relaxed whitespace-pre-wrap overflow-hidden transition-all duration-200",
                  isReasoningExpanded ? "max-h-[1000px]" : "max-h-0"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {message.reasoning}
              </div>
            </div>
          )}

          {message.content && (
            <div
              className={cx(
                "flex flex-col gap-4 w-full",
                message.role === "user" ? "break-all" : "break-words"
              )}
            >
              <div className="w-full [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:rounded-lg">
                <Markdown>{message.content as string}</Markdown>
              </div>
            </div>
          )}

          {message.toolInvocations && message.toolInvocations.length > 0 && (
            <div className="flex flex-col gap-4">
              {message.toolInvocations.map((toolInvocation) => {
                const { toolName, toolCallId, state, args } = toolInvocation
                if (state === "result") {
                  const { result } = toolInvocation

                  return (
                    <div key={toolCallId}>
                      {toolName === "createDoc" ? (
                        <div>
                          <Link
                            to={result}
                            className="p-1 flex gap-2 text-blue-400"
                          >
                            <BookOpenTextIcon></BookOpenTextIcon>
                            {args.title}
                          </Link>
                        </div>
                      ) : toolName === "getWeather" ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === "createDocument" ? (
                        <DocumentToolResult
                          type="create"
                          result={result}
                          block={block}
                          setBlock={setBlock}
                        />
                      ) : toolName === "updateDocument" ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          block={block}
                          setBlock={setBlock}
                        />
                      ) : toolName === "requestSuggestions" ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          block={block}
                          setBlock={setBlock}
                        />
                      ) : (
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  )
                }
                return (
                  <div
                    key={toolCallId}
                    className={cx({
                      skeleton: ["getWeather"].includes(toolName),
                    })}
                  >
                    {toolName === "getWeather" ? (
                      <Weather />
                    ) : toolName === "createDocument" ? (
                      <DocumentToolCall type="create" args={args} />
                    ) : toolName === "updateDocument" ? (
                      <DocumentToolCall type="update" args={args} />
                    ) : toolName === "requestSuggestions" ? (
                      <DocumentToolCall
                        type="request-suggestions"
                        args={args}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

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
        className={cx(
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
