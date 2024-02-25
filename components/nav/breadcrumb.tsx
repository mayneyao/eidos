import { Link } from "react-router-dom"

import { useCurrentNode, useCurrentNodePath } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useLink } from "@/hooks/use-goto"

export const BreadCrumb = () => {
  const node = useCurrentNode()
  const paths = useCurrentNodePath({
    nodeId: node?.id!,
    parentId: node?.parent_id,
  })
  const { space } = useCurrentPathInfo()
  const { getLink } = useLink()
  return (
    <div className="flex items-center">
      {paths.map((p, i) => (
        <div key={p.id} className="flex items-center">
          <Link to={getLink(`/${space}/${p.path || p.id}`)} className="text-sm">
            {p.icon}
            {p.name || "Untitled"}
          </Link>
          {i !== paths.length - 1 && (
            <span className="mx-1 text-sm text-gray-400">/</span>
          )}
        </div>
      ))}
    </div>
  )
}
