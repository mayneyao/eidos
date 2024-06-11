import { Bot, User } from "lucide-react"

import { useAllScripts } from "@/app/[database]/scripts/hooks/use-all-scripts"

import { Button } from "../ui/button"
import { AIMessage } from "./ai-chat-message-prisma"
import { useAIChatStore, usePrompt, useScriptCall } from "./hooks"

export const AIChatMessage = ({
  message,
  msgIndex,
  handleRunCode,
  messages,
}: {
  msgIndex: number
  message: any
  handleRunCode: any
  messages: any
}) => {
  const { currentSysPrompt } = useAIChatStore()
  const prompt = usePrompt(currentSysPrompt)
  const allScripts = useAllScripts()
  const { handleScriptActionCall } = useScriptCall()

  const insertIntoDoc = () => {
    const event = new CustomEvent("AIComplete", {
      detail: message.content,
    })
    document.dispatchEvent(event)
  }

  return (
    <div
      className="group relative flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700"
      key={msgIndex}
    >
      {message.role === "assistant" && (
        <>
          <Bot className="h-4 w-4 shrink-0" />
          <div className="group flex flex-col items-end">
            <AIMessage
              msgId={message.id}
              message={message.content}
              prevMessage={messages[msgIndex - 2]}
              onRun={handleRunCode}
              msgIndex={msgIndex}
            />
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="xs"
                className="border  border-purple-400 opacity-80"
                onClick={insertIntoDoc}
              >
                Insert into doc
              </Button>
              {prompt &&
                prompt.prompt_config?.actions?.map((action) => {
                  const script = allScripts.find((s) => s.id === action)
                  return (
                    <Button
                      className="border  border-purple-400 opacity-80"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        script &&
                          handleScriptActionCall(script, {
                            messages,
                            message,
                            msgIndex,
                          })
                      }}
                    >
                      {script?.name}
                    </Button>
                  )
                })}
            </div>
          </div>
        </>
      )}
      {message.role === "user" && (
        <>
          <User className="h-4 w-4 shrink-0" />
          <div>
            <AIMessage
              msgId={message.id}
              message={message.content}
              onRun={handleRunCode}
              msgIndex={msgIndex}
            />
          </div>
        </>
      )}
    </div>
  )
}
