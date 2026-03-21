import { useContext, type FC } from "react"
import { ExternalLink, FileIcon, GripVertical, Trash2 } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { getFileType } from "@/lib/mime/mime"
import { cn } from "@/lib/utils"
import { TableContext } from "@/components/table/hooks"

export interface CardProps {
  id: string
  text: string
  originalUrl: string
  index: number
  setCurrentPreviewIndex: (i: number) => void
  deleteByUrl: (index: number) => void
}

// Extract filename from path for display
const getDisplayName = (url: string): string => {
  try {
    const decoded = decodeURIComponent(url)
    const filename = decoded.split("/").pop() || url
    return filename
  } catch {
    return url.split("/").pop() || url
  }
}

export const Card: FC<CardProps> = ({
  id,
  text,
  index,
  originalUrl,
  deleteByUrl,
  setCurrentPreviewIndex,
}) => {
  const { isView } = useContext(TableContext)
  const fileType = getFileType(originalUrl)
  const displayName = getDisplayName(originalUrl)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  }

  const handleOpenOriginal = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(originalUrl, "_blank")
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteByUrl(index)
  }

  const handlePreview = () => {
    setCurrentPreviewIndex(index)
  }

  const isImage = fileType === "image"

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handlePreview}
      className={cn(
        "group flex items-center gap-1.5 px-1.5 py-1 rounded",
        "hover:bg-accent/50 cursor-pointer",
        "transition-colors duration-100",
        isDragging && "shadow-md bg-accent/30"
      )}
    >
      {/* Drag Handle */}
      {!isView && (
        <div
          className={cn(
            "flex items-center justify-center w-4 shrink-0",
            "text-muted-foreground/30 hover:text-muted-foreground/60",
            "cursor-grab active:cursor-grabbing"
          )}
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Thumbnail */}
      <div className="shrink-0">
        {isImage ? (
          <img
            src={text}
            alt={displayName}
            className="h-6 w-6 object-cover rounded"
            loading="lazy"
          />
        ) : (
          <div className="h-6 w-6 flex items-center justify-center rounded bg-muted">
            <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Filename */}
      <span className="flex-1 text-xs truncate min-w-0" title={displayName}>
        {displayName}
      </span>

      {/* Actions - always visible on hover */}
      {!isView && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleOpenOriginal}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Open"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
