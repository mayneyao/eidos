import { useRef, useEffect } from "react"
import { useVirtualList } from "ahooks"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { ExtensionItem } from "./extension-item"
import { useExtensionSidebarStore } from "@/apps/web-app/store/extension-store"

interface ExtensionListProps {
  extensions: Array<{
    id: string
    slug: string
    name: string
    icon?: string
    type: string
  }>
  space: string
  scriptId?: string
  searchTerm: string
  renamingExtension: {
    id: string
    currentSlug: string
  } | null
  onRename: (id: string, slug: string) => void
  onConfirmRename: (newSlug?: string) => void
  onCancelRename: () => void
  onDelete: (id: string) => void
}

export const ExtensionList = ({
  extensions,
  space,
  scriptId,
  searchTerm,
  renamingExtension,
  onRename,
  onConfirmRename,
  onCancelRename,
  onDelete,
}: ExtensionListProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { focusedExtensionId, setFocusedExtensionId } = useExtensionSidebarStore()

  const [list, scrollTo] = useVirtualList(extensions, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 32,
    overscan: 5,
  })

  // Handle scrolling to focused extension
  useEffect(() => {
    if (focusedExtensionId && extensions.length > 0) {
      const extensionIndex = extensions.findIndex(
        (ext) => ext.id === focusedExtensionId
      )

      if (extensionIndex !== -1) {
        // Use setTimeout to ensure the virtual list has been updated
        setTimeout(() => {
          scrollTo(extensionIndex)
          // Clear the focus after scrolling
          setFocusedExtensionId(null)
        }, 100)
      }
    }
  }, [focusedExtensionId, extensions, scrollTo, setFocusedExtensionId])

  if (extensions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
        <div className="text-muted-foreground text-xs mb-2">
          {searchTerm ? "No matching extensions" : "No extensions found"}
        </div>
        {!searchTerm && (
          <button
            onClick={() =>
              window.open(
                `${EIDOS_SPACE_BASE_URL}/extensions`,
                "_blank"
              )
            }
            className="text-xs text-primary hover:underline"
          >
            Browse Store
          </button>
        )}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full" ref={containerRef}>
      <div ref={wrapperRef} className="h-full p-1">
        {list.map((item) => {
          const extension = item.data
          const isActive = extension.id === scriptId
          const isRenaming = renamingExtension?.id === extension.id

          return (
            <div
              key={extension.slug}
              style={{
                height: 32,
                display: "flex",
                alignItems: "center",
                marginBottom: 2,
              }}
            >
              <ExtensionItem
                extension={extension}
                space={space}
                isActive={isActive}
                isRenaming={isRenaming}
                onRename={onRename}
                onConfirmRename={onConfirmRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
              />
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
