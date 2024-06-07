import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ItemIcon } from "@/components/sidebar/item-tree"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

import { InnerEditor } from "../../editor"

export const MentionComponent = (props: { id: string }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  // TODO: pass from props
  const { getNode } = useQueryNode()
  const { id } = props
  const router = useNavigate()
  const onClick = () => {
    router(`/${space}/${id}`)
  }
  useEffect(() => {
    getNode(id).then((node) => {
      setNode(node ?? null)
    })
  }, [getNode, id])
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span
            className=" inline-block cursor-pointer rounded-sm px-1 underline hover:bg-secondary"
            id={id}
            onClick={onClick}
          >
            {node && (
              <NodeIconEditor
                icon={node.icon}
                nodeId={node.id}
                disabled
                size="1em"
                customTrigger={
                  <ItemIcon
                    type={node?.type ?? ""}
                    className="mr-1 inline-block h-4 w-4"
                  />
                }
              />
            )}
            {node ? node.name || "Untitled" : "loading"}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          className=" max-h-[500px]  min-w-[300px] max-w-[450px] overflow-y-auto p-4"
        >
          {node?.type === "doc" && (
            <InnerEditor
              isEditable={false}
              docId={node.id}
              title={node.name}
              disableSelectionPlugin
              disableSafeBottomPaddingPlugin
              className={"w-full max-w-full"}
            />
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
