import { useState } from "react"
import type { Message } from "ai"
import { EyeIcon, EyeOffIcon, PlayIcon } from "lucide-react"
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
  const { setScriptCodeMap, setLayoutMode } = useEditorStore()
  const [isPreviewEnabled, setIsPreviewEnabled] = useState(false)

  if (isLoading) return null
  if (message.role === "user") return null
  if (message.toolInvocations && message.toolInvocations.length > 0) return null
  const codeBlocks = getCodeFromMarkdown(message.content as string)

  const handleApply = () => {
    const indexJsxCode = codeBlocks.find(
      (code) => code.lang === "jsx" || code.lang === "typescript"
    )?.code
    if (indexJsxCode) {
      setScriptCodeMap(chatId, indexJsxCode)
      setLayoutMode("full")
    }
  }

  const handleTogglePreview = () => {
    const indexJsxCode = codeBlocks.find(
      (code) => code.lang === "jsx" || code.lang === "typescript"
    )?.code
    if (isPreviewEnabled) {
      setScriptCodeMap("current", "")
    } else if (indexJsxCode) {
      setScriptCodeMap("current", indexJsxCode)
    }
    setIsPreviewEnabled(!isPreviewEnabled)
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
          <>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={handleApply}
            >
              <PlayIcon className="w-4 h-4" />
            </Button>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={handleTogglePreview}
            >
              {isPreviewEnabled ? (
                <EyeOffIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
            </Button>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
