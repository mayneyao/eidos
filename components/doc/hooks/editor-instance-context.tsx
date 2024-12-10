import { ReactNode, createContext, useContext, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { useAllMblocks } from "@/apps/web-app/[database]/scripts/hooks/use-all-mblocks"

interface EditorInstanceContextType {
  mblocks: IScript[]
  isSelecting: boolean
  setIsSelecting: (value: boolean) => void
  selectedKeys: Set<string>
  setSelectedKeys: (keys: Set<string>) => void
}

const EditorInstanceContext = createContext<EditorInstanceContextType>({
  mblocks: [],
  isSelecting: false,
  setIsSelecting: () => {},
  selectedKeys: new Set(),
  setSelectedKeys: () => {},
})

export function EditorInstanceProvider({ children }: { children: ReactNode }) {
  const { mblocks } = useAllMblocks()
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>())

  const value = {
    mblocks,
    isSelecting,
    setIsSelecting,
    selectedKeys,
    setSelectedKeys,
  }

  return (
    <EditorInstanceContext.Provider value={value}>
      {children}
    </EditorInstanceContext.Provider>
  )
}

export const useEditorInstance = () => useContext(EditorInstanceContext)
