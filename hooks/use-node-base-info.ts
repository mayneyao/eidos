import { useEffect, useState } from "react"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useSqlite } from "@/hooks/use-sqlite"

export const useNodeBaseInfo = (node: ITreeNode | null) => {
  const [updated_at, setUpdatedAt] = useState(node?.updated_at)
  const { sqlite } = useSqlite()
  useEffect(() => {
    if (!node) return
    if (node.type === "doc") {
      sqlite?.getDocBaseInfo(node.id).then((info) => {
        setUpdatedAt(info?.updated_at)
      })
    } else {
      setUpdatedAt("")
    }
  }, [node, sqlite])

  return {
    updated_at,
  }
}
