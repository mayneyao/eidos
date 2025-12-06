import { createContext, useContext, useState, type ReactNode } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"

import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
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
  imageAlign: "left" | "center" | "right"
  container: HTMLElement | null
  queryWithinContainer: (selector: string) => Element | null
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
  imageAlign: "center",
  container: null,
  queryWithinContainer: () => null,
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
    showReferenceNodeIcon: false,
    imageAlign: "center",
  })
  const markerProperty = spaceDocSettings.markerProperty
  const showReferenceNodeIcon = spaceDocSettings.showReferenceNodeIcon
  const imageAlign = spaceDocSettings.imageAlign

  let tabContainer: HTMLElement | null = null
  try {
    const { containerRef } = useTabContext()
    tabContainer = containerRef?.current ?? null
  } catch (error) {
    // Ignore when not inside a TabContainer
  }

  const queryWithinContainer = (selector: string) => {
    if (typeof document === "undefined") return null
    if (tabContainer) return tabContainer.querySelector(selector)
    return document.querySelector(selector)
  }

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
    imageAlign,
    container: tabContainer,
    queryWithinContainer,
  }

  return (
    <EditorInstanceContext.Provider value={value}>
      {children}
    </EditorInstanceContext.Provider>
  )
}

export const useEditorInstance = () => useContext(EditorInstanceContext)
