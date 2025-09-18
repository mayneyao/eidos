import { createContext, useContext, useState, type ReactNode } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"

import { useSpaceSettings } from "@/hooks/use-space-settings"
import { useDocProperty } from "@/apps/web-app/components/doc-property-global/hook"
import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"

interface EditorInstanceContextType {
  mblocks: IExtension[]
  isSelecting: boolean
  setIsSelecting: (value: boolean) => void
  selectedKeys: Set<string>
  setSelectedKeys: (keys: Set<string>) => void
  docId: string | null
  // Document properties - only getter
  docProperties: Record<string, any> | null
  markerProperty: string
  showReferenceNodeIcon: boolean
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
  markerProperty: "",
  showReferenceNodeIcon: false,
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
  const { properties: docProperties } = useDocProperty({ docId: docId || "" })

  const { data: spaceDocSettings } = useSpaceSettings("doc", {
    markerProperty: "",
  })
  const markerProperty = spaceDocSettings.markerProperty
  const showReferenceNodeIcon = spaceDocSettings.showReferenceNodeIcon

  const value = {
    mblocks,
    isSelecting,
    setIsSelecting,
    selectedKeys,
    setSelectedKeys,
    docId,
    // Document properties - only getter
    docProperties,
    markerProperty,
    showReferenceNodeIcon,
  }

  return (
    <EditorInstanceContext.Provider value={value}>
      {children}
    </EditorInstanceContext.Provider>
  )
}

export const useEditorInstance = () => useContext(EditorInstanceContext)
