import { useEffect, useState } from "react"

import { ITreeNode } from "@/lib/store/ITreeNode"

import { FolderComponent } from "./folder"
import { NodeDetail } from "./node-detail"

export const FolderTree = ({ folderId }: { folderId?: string }) => {
  const [folderList, setFolderList] = useState<(string | undefined)[]>([
    folderId,
  ])
  const [currentNode, setCurrentNode] = useState<ITreeNode | null>(null)

  const setFolder = (fid: string, index: number) => {
    setFolderList((oldFolderList) => {
      return oldFolderList.slice(0, index + 1).concat(fid)
    })
  }
  const setCurrentIndex = (index: number) => {
    setFolderList((oldFolderList) => {
      return oldFolderList.slice(0, index + 1)
    })
  }

  useEffect(() => {
    setFolderList([folderId])
  }, [folderId])

  return (
    <div className="flex h-full px-6 pb-4">
      {folderList.map((id, index) => {
        return (
          <FolderComponent
            key={id}
            folderList={folderList}
            index={index}
            folderId={id}
            setFolder={setFolder}
            setCurrentIndex={setCurrentIndex}
            currentNode={currentNode}
            setCurrentNode={setCurrentNode}
          />
        )
      })}
      <NodeDetail currentNode={currentNode} />
    </div>
  )
}
