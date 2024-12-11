import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { isDayPageId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"

// import { InnerEditor } from "../../editor"

export const SyncBlockComponent = (props: { id: string }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
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
    <div className="rounded-sm ring-purple-300 hover:ring">
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
