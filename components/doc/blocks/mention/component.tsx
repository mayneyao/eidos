import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn, isDayPageId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ItemIcon } from "@/components/sidebar/item-tree"
import { NodeIconEditor } from "@/apps/web-app/[database]/[node]/node-icon"

import { InnerEditor } from "../../editor"

export const MentionComponent = (props: { id: string; title?: string; disablePreview?: boolean }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  // TODO: pass from props
  const { getNode } = useQueryNode()
  const { id } = props
  const router = useNavigate()
  const onClick = () => {
    if (isDayPageId(id)) {
      return router(`/${space}/everyday/${id}`)
    }
    router(`/${space}/${id}`)
  }
  useEffect(() => {
    if (isDayPageId(id)) {
      setNode({
        id,
        name: id,
        type: "day" as any,
      })
    } else {
      getNode(id).then((node) => {
        setNode(node ?? null)
      })
    }
  }, [getNode, id])

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100} {...(props.disablePreview && { open: false })}>
        <TooltipTrigger>
          <span
            className={cn(
              "inline-flex shrink-0 cursor-pointer",
              "items-baseline rounded-sm px-1 underline hover:bg-secondary",
              {
                "text-red-400": node?.is_deleted,
              }
            )}
            id={id}
            onClick={onClick}
          >
            <span className="inline-flex items-center mr-1">
              {node && node.icon ? (
                <NodeIconEditor
                  icon={node.icon}
                  nodeId={node.id}
                  disabled
                  size="1rem"
                />
              ) : (
                <ItemIcon
                  type={node?.type ?? ""}
                  className="h-4 w-4 translate-y-[0.1em]"
                />
              )}
            </span>
            <span className="!my-0 max-w-[18rem] truncate">
              {node ? node.name || "Untitled" : props.title || "loading"}
            </span>
          </span>
        </TooltipTrigger>
        {!props.disablePreview && (
          <TooltipContent
            side="bottom"
            align="start"
            className=" max-h-[500px]  min-w-[300px] max-w-[450px] overflow-y-auto p-4"
          >
            {node && (node?.type === "doc" || node?.type === "day") && (
              <InnerEditor
                isEditable={false}
                docId={node.id}
                disableSelectionPlugin
                disableSafeBottomPaddingPlugin
                className={"prose w-full max-w-full dark:prose-invert"}
              />
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}