import { Link } from "react-router-dom"
import { PinIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import { ExtensionRenameInput } from "./extension-rename-input"
import { ExtensionContextMenu } from "./extension-context-menu"

interface ExtensionItemProps {
  extension: {
    id: string
    slug: string
    name: string
    icon?: string
    type: string
  }
  space: string
  isActive: boolean
  isRenaming: boolean
  onRename: (id: string, slug: string) => void
  onConfirmRename: (newSlug?: string) => void
  onCancelRename: () => void
  onDelete: (id: string) => void
}

export const ExtensionItem = ({
  extension,
  space,
  isActive,
  isRenaming,
  onRename,
  onConfirmRename,
  onCancelRename,
  onDelete,
}: ExtensionItemProps) => {
  const { isFavorite } = useFavBlocks()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    // Keyboard shortcuts for rename:
    // - Enter: Trigger rename (primary shortcut)
    // - F2: Trigger rename (Windows/VS Code pattern)
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      onRename(extension.id, extension.slug)
    } else if (e.key === "F2") {
      e.preventDefault()
      e.stopPropagation()
      onRename(extension.id, extension.slug)
    }
    // Let other keys (like Enter alone) work normally for navigation
  }

  if (isRenaming) {
    return (
      <ExtensionRenameInput
        extensionId={extension.id}
        currentSlug={extension.slug}
        extensionType={extension.type}
        onConfirm={onConfirmRename}
        onCancel={onCancelRename}
      />
    )
  }

  return (
    <ExtensionContextMenu
      extension={extension}
      onRename={onRename}
      onDelete={onDelete}
    >
      <Link
        to={`/${space}/extensions/${extension.id}`}
        className={cn(
          "flex items-center gap-2 rounded-sm pl-2 py-1 text-sm transition-colors w-full text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
          isActive ? "bg-muted/80" : "hover:bg-muted/80"
        )}
        onKeyDown={handleKeyDown}
      >
        <span className="flex-1 truncate">
          {extension.slug}.{extension.type === "script" ? "ts" : "tsx"}
        </span>

        {/* show pin icon if it is pinned */}
        {isFavorite(extension.id) && (
          <PinIcon className="h-4 w-4" />
        )}
      </Link>
    </ExtensionContextMenu>
  )
}
