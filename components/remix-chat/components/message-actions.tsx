import type { Message } from "ai"
import { PlayIcon } from "lucide-react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"
import { useCopyToClipboard } from "usehooks-ts"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useEditorStore } from "@/apps/web-app/[database]/scripts/stores/editor-store"

import type { Vote } from "../interface"
import { CopyIcon } from "./icons"

export function MessageActions({
  chatId,
  message,
  vote,
  isLoading,
}: {
  chatId: string
  message: Message
  vote: Vote | undefined
  isLoading: boolean
}) {
  const { mutate } = useSWRConfig()
  const [_, copyToClipboard] = useCopyToClipboard()
  const { setScriptCodeMap } = useEditorStore()

  if (isLoading) return null
  if (message.role === "user") return null
  if (message.toolInvocations && message.toolInvocations.length > 0) return null
  const codeBlocks = getCodeFromMarkdown(message.content as string)

  const handleApply = () => {
    const indexJsxCode = codeBlocks.find((code) => code.lang === "jsx")?.code
    if (indexJsxCode) {
      setScriptCodeMap(chatId, indexJsxCode)
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-row gap-2">
        <Button
          className="py-1 px-2 h-fit text-muted-foreground"
          variant="outline"
          onClick={async () => {
            await copyToClipboard(message.content as string)
            toast.success("Copied to clipboard!")
          }}
        >
          <CopyIcon />
        </Button>
        {codeBlocks.length > 0 && (
          <Button
            className="py-1 px-2 h-fit text-muted-foreground"
            variant="outline"
            onClick={handleApply}
          >
            <PlayIcon className="w-4 h-4" />
          </Button>
        )}

        {/* <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              disabled={vote?.isUpvoted}
              variant="outline"
              onClick={async () => {
                const messageId = getMessageIdFromAnnotations(message)

                const upvote = fetch("/api/vote", {
                  method: "PATCH",
                  body: JSON.stringify({
                    chatId,
                    messageId,
                    type: "up",
                  }),
                })

                toast.promise(upvote, {
                  loading: "Upvoting Response...",
                  success: () => {
                    mutate<Array<Vote>>(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes) => {
                        if (!currentVotes) return []

                        const votesWithoutCurrent = currentVotes.filter(
                          (vote) => vote.messageId !== message.id
                        )

                        return [
                          ...votesWithoutCurrent,
                          {
                            chatId,
                            messageId: message.id,
                            isUpvoted: true,
                          },
                        ]
                      },
                      { revalidate: false }
                    )

                    return "Upvoted Response!"
                  },
                  error: "Failed to upvote response.",
                })
              }}
            >
              <ThumbUpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upvote Response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              variant="outline"
              disabled={vote && !vote.isUpvoted}
              onClick={async () => {
                const messageId = getMessageIdFromAnnotations(message)

                const downvote = fetch("/api/vote", {
                  method: "PATCH",
                  body: JSON.stringify({
                    chatId,
                    messageId,
                    type: "down",
                  }),
                })

                toast.promise(downvote, {
                  loading: "Downvoting Response...",
                  success: () => {
                    mutate<Array<Vote>>(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes) => {
                        if (!currentVotes) return []

                        const votesWithoutCurrent = currentVotes.filter(
                          (vote) => vote.messageId !== message.id
                        )

                        return [
                          ...votesWithoutCurrent,
                          {
                            chatId,
                            messageId: message.id,
                            isUpvoted: false,
                          },
                        ]
                      },
                      { revalidate: false }
                    )

                    return "Downvoted Response!"
                  },
                  error: "Failed to downvote response.",
                })
              }}
            >
              <ThumbDownIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Downvote Response</TooltipContent>
        </Tooltip> */}
      </div>
    </TooltipProvider>
  )
}
