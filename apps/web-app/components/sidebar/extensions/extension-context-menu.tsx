import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useToast } from "@/components/ui/use-toast"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import {
  PencilLineIcon,
  CopyIcon,
  Trash2Icon,
  PinIcon,
  PinOffIcon,
} from "lucide-react"

interface ExtensionContextMenuProps {
  extension: {
    id: string
    slug: string
    name: string
    icon?: string
    type: string
  }
  children: React.ReactNode
  onRename: (id: string, slug: string) => void
  onDelete: (id: string) => void
}

export const ExtensionContextMenu = ({
  extension,
  children,
  onRename,
  onDelete,
}: ExtensionContextMenuProps) => {
  const { toast } = useToast()
  const { isFavorite, toggleFavBlock } = useFavBlocks()

  const handleCopySlug = () => {
    const slug = `${extension.slug}`
    navigator.clipboard.writeText(slug)
    toast({
      title: "Slug copied to clipboard",
      description: slug,
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {extension.type === "block" && (
          <ContextMenuItem
            onSelect={() => {
              toggleFavBlock({
                id: extension.id,
                name: extension.name,
                icon: extension.icon,
              })
            }}
          >
            {isFavorite(extension.id) ? (
              <PinOffIcon className="mr-2 h-4 w-4" />
            ) : (
              <PinIcon className="mr-2 h-4 w-4" />
            )}
            {isFavorite(extension.id) ? "Unpin" : "Pin"}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => onRename(extension.id, extension.slug)}
        >
          <PencilLineIcon className="mr-2 h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopySlug}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Copy Slug
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onDelete(extension.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2Icon className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
