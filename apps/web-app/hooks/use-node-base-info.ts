import { useEffect, useState } from "react"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const useNodeBaseInfo = (node: ITreeNode | null) => {
  const [updated_at, setUpdatedAt] = useState(node?.updated_at)
  const { sqlite } = useSqlite()
  useEffect(() => {
    if (!node) return
    if (node.type === "doc") {
      sqlite?.doc.getBaseInfo(node.id).then((info) => {
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
