import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { ITreeNode } from "@/lib/store/ITreeNode"

import { ItemIcon } from "../sidebar/item-tree"
import { Button } from "../ui/button"

export const NodeDetail = ({
  currentNode,
}: {
  currentNode: ITreeNode | null
}) => {
  const { space: spaceName } = useCurrentPathInfo()
  const goto = useGoto()
  const handleOpen = () => {
    goto(spaceName, currentNode?.id)
  }

  if (!currentNode || currentNode?.type == "folder") {
    return null
  }

  return (
    <div className="w-[340px] rounded-lg  p-6">
      <div className="mb-4 flex items-center justify-center">
        <div className="h-16 rounded-lg  bg-accent  p-6">
          {currentNode.icon ? (
            <span className="   text-[1.5rem] leading-[1.5rem]">
              {currentNode.icon}
            </span>
          ) : (
            <ItemIcon type={currentNode.type} className="h-6 w-6" />
          )}
        </div>
      </div>
      <div className="text-center">
        <h3 className="mb-1 text-lg font-semibold">
          {currentNode.name || "Untitled"}
        </h3>
        <p className="mb-4 font-mono text-sm  text-gray-500">
          {currentNode.id}
        </p>
      </div>
      <div className="font-mono">
        <h4 className="mb-1 text-sm font-semibold text-gray-700">
          Information
        </h4>
        <div className="text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Created</span>
            <span>{currentNode.created_at}</span>
          </div>
          <div className="flex justify-between">
            <span>Modified</span>
            <span>{currentNode.updated_at}</span>
          </div>
          <div className="flex justify-between">
            <span>Last opened</span>
            <span>--</span>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold text-gray-700">Tags</h4>
        <Button variant="outline" className="text-sm" size="xs">
          Add Tags...
        </Button>
      </div>
      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold text-gray-700">Actions</h4>
        <Button
          variant="outline"
          className="w-full"
          size="sm"
          onClick={handleOpen}
        >
          Open
        </Button>
      </div>
    </div>
  )
}
