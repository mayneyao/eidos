import type { ReactNode} from "react";
import { createContext, useContext, useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"

import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"
import { useDocProperty } from "@/apps/web-app/components/doc-property-global/hook"

interface EditorInstanceContextType {
  mblocks: IExtension[]
  isSelecting: boolean
  setIsSelecting: (value: boolean) => void
  selectedKeys: Set<string>
  setSelectedKeys: (keys: Set<string>) => void
  docId: string | null
  // Document properties - only getter
  docProperties: Record<string, any> | null
}

const EditorInstanceContext = createContext<EditorInstanceContextType>({
  mblocks: [],
  isSelecting: false,
  setIsSelecting: () => {},
  selectedKeys: new Set(),
  setSelectedKeys: () => {},
  docId: null,
  // Document properties defaults
  docProperties: null,
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
  
  // Use useDocProperty hook for reactive document properties
  const { properties: docProperties } = useDocProperty({ docId: docId || '' })

  const value = {
    mblocks,
    isSelecting,
    setIsSelecting,
    selectedKeys,
    setSelectedKeys,
    docId,
    // Document properties - only getter
    docProperties,
  }

  return (
    <EditorInstanceContext.Provider value={value}>
      {children}
    </EditorInstanceContext.Provider>
  )
}

export const useEditorInstance = () => useContext(EditorInstanceContext)
