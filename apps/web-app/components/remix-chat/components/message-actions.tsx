import { useMemo, useState } from "react"
import { applyCode } from "@/packages/ai/generate"
import type { Message } from "ai"
import { Loader2, PlayIcon, RefreshCwIcon } from "lucide-react"
import { useSWRConfig } from "swr"
import { useCopyToClipboard } from "usehooks-ts"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { useAiConfig } from "@/hooks/use-ai-config"
import { useCurrentExtension } from "@/hooks/use-current-node"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useEditorStore } from "@/apps/web-app/pages/[database]/extensions/stores/editor-store"

import type { Vote } from "../interface"
import { CopyIcon } from "./icons"

export function MessageActions({
  chatId,
  projectId,
  message,
  vote,
  isLoading,
  onRegenerate,
  isLastMessage,
  hideApply,
}: {
  chatId: string
  projectId: string
  message: Message
  vote: Vote | undefined
  isLoading: boolean
  onRegenerate?: () => void
  isLastMessage?: boolean
  hideApply?: boolean
}) {
  const { mutate } = useSWRConfig()
  const [_, copyToClipboard] = useCopyToClipboard()
  const { setScriptCodeMap, setLayoutMode } = useEditorStore()
  const { searchParams, setSearchParams } = useRouterAdapter()
  const [isPreviewEnabled, setIsPreviewEnabled] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const currentExtension = useCurrentExtension()
  const { getLLModel, applyCodeModel, findFirstAvailableModel } = useAiConfig()
  const content = useMemo(
    () =>
      message.parts
        ?.filter((part) => part.type === "text")
        .map((part: any) => part.text)
        .join(""),
    [message.parts]
  )

  if (isLoading) return null
  if (message.role === "user") return null

  const codeBlocks = getCodeFromMarkdown(content || message.content)

  const handleApply = async () => {
    const indexJsxCode = codeBlocks.find(
      (code) =>
        code.lang === "jsx" ||
        code.lang === "tsx" ||
        code.lang === "typescript" ||
        code.lang === "python" ||
        code.lang === "javascript" ||
        code.lang === "markdown"
    )?.code
    console.log("indexJsxCode", indexJsxCode)

    if (indexJsxCode) {
      if (!applyCodeModel) {
        console.log("applyCodeModel", applyCodeModel)
        toast({
          title: "Please configure an apply code model in AI settings first",
          variant: "destructive",
        })
        return
      }

      try {
        setIsApplying(true)
        const model = getLLModel(applyCodeModel)
        const newCode = await applyCode({
          originalCode: currentExtension?.ts_code || "",
          updateSnippet: indexJsxCode,
          model,
        })
        setScriptCodeMap(projectId, newCode)
        // setLayoutMode("code")
        setSearchParams({ tab: "code" })
      } catch (error) {
        console.error("Failed to apply code:", error)
        toast({
          title: "Failed to apply code",
          variant: "destructive",
        })
      } finally {
        setIsApplying(false)
      }
    }
  }

  const handleTogglePreview = () => {
    const indexJsxCode = codeBlocks.find(
      (code) =>
        code.lang === "jsx" ||
        code.lang === "typescript" ||
        code.lang === "python"
    )?.code
    if (isPreviewEnabled) {
      setScriptCodeMap("current", "")
      setLayoutMode("code")
    } else if (indexJsxCode) {
      setScriptCodeMap("current", indexJsxCode)
      setLayoutMode("preview")
    }
    setIsPreviewEnabled(!isPreviewEnabled)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-row gap-2" role="message-actions">
        {isLastMessage && message.role === "assistant" && (
          <Button
            className="py-1 px-2 h-fit text-muted-foreground"
            variant="outline"
            onClick={onRegenerate}
          >
            <RefreshCwIcon className="w-4 h-4" />
          </Button>
        )}
        <Button
          className="py-1 px-2 h-fit text-muted-foreground"
          variant="outline"
          onClick={async () => {
            await copyToClipboard(message.content as string)
            toast({
              title: "Copied to clipboard!",
            })
          }}
        >
          <CopyIcon />
        </Button>
        {codeBlocks.length > 0 && !hideApply && (
          <>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={handleApply}
              disabled={isApplying}
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlayIcon className="w-4 h-4" />
              )}
            </Button>
            {/* <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={handleTogglePreview}
              disabled
            >
              {isPreviewEnabled ? (
                <EyeOffIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
            </Button> */}
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
