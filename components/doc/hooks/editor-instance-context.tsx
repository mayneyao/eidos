import { ReactNode, createContext, useContext, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { useAllMblocks } from "@/apps/web-app/[database]/scripts/hooks/use-all-mblocks"

interface EditorInstanceContextType {
  mblocks: IScript[]
  isSelecting: boolean
  setIsSelecting: (value: boolean) => void
  selectedKeys: Set<string>
  setSelectedKeys: (keys: Set<string>) => void
  docId: string | null
}

const EditorInstanceContext = createContext<EditorInstanceContextType>({
  mblocks: [],
  isSelecting: false,
  setIsSelecting: () => {},
  selectedKeys: new Set(),
  setSelectedKeys: () => {},
  docId: null,
})

export function EditorInstanceProvider({
  children,
  docId,
}: {
  children: ReactNode
  docId: string | null
}) {
  const { mblocks } = useAllMblocks()
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>())

  const value = {
    mblocks,
    isSelecting,
    setIsSelecting,
    selectedKeys,
    setSelectedKeys,
    docId,
  }

  return (
    <EditorInstanceContext.Provider value={value}>
      {children}
    </EditorInstanceContext.Provider>
  )
}

export const useEditorInstance = () => useContext(EditorInstanceContext)
