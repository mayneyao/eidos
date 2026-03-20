import { useEffect, useRef } from "react"
import { FolderIcon, FileIcon, ExternalLinkIcon } from "lucide-react"
import type { FileEntry } from "../types"

interface ContextMenuProps {
  x: number
  y: number
  entry: FileEntry | null
  onClose: () => void
  onOpen: (entry: FileEntry) => void
  onOpenInNewTab?: (entry: FileEntry) => void
}

export function ContextMenu({
  x,
  y,
  entry,
  onClose,
  onOpen,
  onOpenInNewTab,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  if (!entry) return null

  // Adjust position to keep menu within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 150)

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-50 w-[200px] bg-popover border rounded-md shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
    >
      <div className="px-3 py-2 border-b mb-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {entry.kind === "directory" ? (
            <FolderIcon className="h-4 w-4 text-amber-500" />
          ) : (
            <FileIcon className="h-4 w-4 text-slate-400" />
          )}
          <span className="truncate max-w-[140px]">{entry.name}</span>
        </div>
      </div>

      <button
        onClick={() => {
          onOpen(entry)
          onClose()
        }}
        className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
      >
        <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
        Open
      </button>

      {entry.kind === "file" && onOpenInNewTab && (
        <button
          onClick={() => {
            onOpenInNewTab(entry)
            onClose()
          }}
          className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
          Open in New Tab
        </button>
      )}
    </div>
  )
}
