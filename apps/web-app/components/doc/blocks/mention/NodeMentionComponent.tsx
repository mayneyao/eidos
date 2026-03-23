import { useEffect, useState } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"

import { cn, isDayPageId } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDocProperty } from "@/components/doc-property-global/hook"
import { ItemIcon } from "@/components/sidebar/nodes"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { NodeIconEditor } from "@/apps/web-app/pages/[database]/[node]/node-icon"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"

import { InnerEditor } from "../../editor"
import { useEditorInstance } from "../../hooks/editor-instance-context"

interface NodeMentionComponentProps {
  id: string
  nodeKey: string
  title?: string
  disablePreview?: boolean
}

export const NodeMentionComponent = (props: NodeMentionComponentProps) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  const { getNode } = useQueryNode()
  const { id } = props
  const { navigate } = useRouterAdapter()
  const { markerProperty, showReferenceNodeIcon } = useEditorInstance()
  const { properties } = useDocProperty({ docId: id })
  const { setTempPanelNode, setIsRightPanelOpen, clearCurrentApp } =
    useSpaceAppStore()

  const [isNodeSelected] = useLexicalNodeSelection(props.nodeKey)

  const onClick = (event: React.MouseEvent) => {
    if (event.altKey) {
      event.preventDefault()
      const nodeToShow = node || {
        id,
        name: props.title || "Loading...",
        type: isDayPageId(id) ? "day" : "doc",
        is_deleted: false,
      }
      clearCurrentApp()
      setTempPanelNode(nodeToShow)
      setIsRightPanelOpen(true, -1)
      return
    }

    if (isDayPageId(id)) {
      return navigate(`/journals/${id}`)
    }
    navigate(`/${id}`)
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
      <Tooltip
        delayDuration={200}
        {...(props.disablePreview && { open: false })}
      >
        <TooltipTrigger>
          <>
            <span
              className={cn(
                "inline-flex shrink-0 cursor-pointer",
                "items-baseline rounded-xs px-1 underline hover:bg-secondary",
                {
                  "text-red-400": node?.is_deleted,
                  "ring-1 ring-ring": isNodeSelected,
                  "bg-secondary": isNodeSelected,
                }
              )}
              id={id}
              onClick={onClick}
            >
              {showReferenceNodeIcon && (
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
              )}
              <span className="!my-0 max-w-[32rem] truncate">
                {node ? node.name || "Untitled" : props.title || "loading"}
              </span>
            </span>
            {markerProperty && properties?.[markerProperty] && (
              <sup className="text-muted-foreground text-xs">
                {properties?.[markerProperty]}
              </sup>
            )}
          </>
        </TooltipTrigger>
        {!props.disablePreview &&
          node &&
          (node?.type === "doc" || node?.type === "day") && (
            <TooltipContent
              side="bottom"
              align="start"
              className="max-h-[500px]  min-w-[300px] max-w-[450px] overflow-y-auto p-4 bg-secondary"
            >
              <InnerEditor
                isEditable={false}
                docId={node.id}
                disableSelectionPlugin
                disableSafeBottomPaddingPlugin
                disablePlaceholder
                className={"prose w-full max-w-full dark:prose-invert"}
              />
            </TooltipContent>
          )}
      </Tooltip>
    </TooltipProvider>
  )
}
