import { useEffect, useState } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

import { isDayPageId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

// import { InnerEditor } from "../../editor"

export const SyncBlockComponent = (props: { id: string }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  const { getNode } = useQueryNode()
  const { id } = props
  const { navigate } = useRouterAdapter()

  const onClick = () => {
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
    <div className="rounded-xs ring-purple-300 hover:ring">
      {node?.type === "doc" ||
        (node?.type === "day" && (
          <div>to be done</div>
          // <InnerEditor
          //   isEditable={node.is_locked ? false : true}
          //   docId={node.id}
          //   disableSelectionPlugin
          //   disableSafeBottomPaddingPlugin
          //   className={"prose max-w-full dark:prose-invert"}
          // />
        ))}
    </div>
  )
}
