import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualList } from "ahooks"
import {
  ArrowUpDownIcon,
  PanelLeftCloseIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { useAllExtensions } from "@/apps/web-app/hooks/use-all-extensions"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useExtensionSidebarStore } from "../stores/sidebar-store"
import { NewExtensionButton } from "./new-extension-button"

interface ExtensionSidebarProps {
  className?: string
}

type SortOption = "name" | "created" | "updated"

export const ExtensionSidebar = ({ className }: ExtensionSidebarProps) => {
  const { space } = useCurrentPathInfo()
  const { scriptId } = useParams()
  const { toast } = useToast()
  const navigate = useNavigate()
  const {
    extensions: allExtensions,
    deleteExtension,
    renameExtension,
  } = useAllExtensions()
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("name")
  const [showSearch, setShowSearch] = useState(false)
  const [renamingExtension, setRenamingExtension] = useState<{
    id: string
    currentSlug: string
  } | null>(null)
  const [newSlug, setNewSlug] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const editableRef = useRef<HTMLSpanElement>(null)
  const {
    isSidebarOpen,
    toggleSidebar,
    focusedExtensionId,
    setFocusedExtensionId,
  } = useExtensionSidebarStore()

  // Initialize contentEditable content when entering rename mode
  useEffect(() => {
    if (renamingExtension && editableRef.current) {
      const element = editableRef.current
      element.textContent = renamingExtension.currentSlug

      // Use setTimeout to ensure DOM is updated before focusing and selecting
      setTimeout(() => {
        element.focus()

        // Select all text
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }, 0)
    }
  }, [renamingExtension])

  // Handle extension deletion with navigation
  const handleDeleteExtension = async (id: string) => {
    const success = await deleteExtension(id)
    if (success) {
      // Navigate to extensions index page after successful deletion
      navigate(`/${space}/extensions`)
    } else {
      // Show error toast if deletion failed
      toast({
        title: "Failed to delete extension",
        description: "An error occurred while deleting the extension",
        variant: "destructive",
      })
    }
  }

  const handleRenameExtension = (extensionId: string, currentSlug: string) => {
    setRenamingExtension({ id: extensionId, currentSlug })
    setNewSlug(currentSlug)
  }

  const handleConfirmRename = async () => {
    if (!renamingExtension || !newSlug.trim() || isRenaming) return

    setIsRenaming(true)
    const result = await renameExtension(renamingExtension.id, newSlug.trim())

    if (result.success) {
      // Silent success - no toast notification for routine operations
      setRenamingExtension(null)
      setNewSlug("")
    } else {
      // Show toast only for errors
      toast({
        title: "Failed to rename extension",
        description: result.error,
        variant: "destructive",
      })
    }
    setIsRenaming(false)
  }

  const handleCancelRename = () => {
    setRenamingExtension(null)
    setNewSlug("")
    setIsRenaming(false)
  }
  // Filter and sort extensions
  const filteredExtensions = useMemo(() => {
    let filtered = allExtensions

    // Filter by search term
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (ext) =>
          ext.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ext.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Sort extensions
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "created":
          // Extensions have created_at from the database schema
          const aCreated = (a as any).created_at || "1970-01-01T00:00:00.000Z"
          const bCreated = (b as any).created_at || "1970-01-01T00:00:00.000Z"
          return new Date(bCreated).getTime() - new Date(aCreated).getTime() // newest first
        case "updated":
          // Extensions have updated_at from the database schema
          const aUpdated = (a as any).updated_at || "1970-01-01T00:00:00.000Z"
          const bUpdated = (b as any).updated_at || "1970-01-01T00:00:00.000Z"
          return new Date(bUpdated).getTime() - new Date(aUpdated).getTime() // newest first
        default:
          return 0
      }
    })

    return sorted
  }, [allExtensions, searchTerm, sortBy])

  const [list, scrollTo] = useVirtualList(filteredExtensions, {
    containerTarget: () =>
      document.querySelector("[data-radix-scroll-area-viewport]"),
    wrapperTarget: () => document.querySelector("[data-virtual-list-wrapper]"),
    itemHeight: 32,
    overscan: 5,
  })

  // Handle scrolling to focused extension
  useEffect(() => {
    if (focusedExtensionId && filteredExtensions.length > 0) {
      const extensionIndex = filteredExtensions.findIndex(
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
  }, [focusedExtensionId, filteredExtensions, scrollTo, setFocusedExtensionId])

  // Don't render if sidebar is closed
  if (!isSidebarOpen) {
    return null
  }

  return (
    <div
      className={cn(
        "w-64 flex-shrink-0 border-r bg-muted/20 flex flex-col h-full px-2",
        className
      )}
    >
      {/* Header with Icon Triggers */}
      <div className="p-1 border-b flex-shrink-0">
        {/* Icon Buttons Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Create Extension Dropdown */}
            <NewExtensionButton
              trigger={
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <PlusIcon className="h-4 w-4" />
                </Button>
              }
            />

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowUpDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-32">
                <DropdownMenuItem onClick={() => setSortBy("name")}>
                  A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("created")}>
                  Created Time
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("updated")}>
                  Updated Time
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Search Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowSearch(!showSearch)}
            >
              <SearchIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Close Sidebar Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleSidebar}
          >
            <PanelLeftCloseIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Conditional Search Input */}
        {showSearch && (
          <div className="relative mt-2">
            <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search extensions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div data-virtual-list-container className="p-1">
            <div data-virtual-list-wrapper>
              {list.map((item) => {
                const extension = item.data
                const isActive = extension.id === scriptId

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
                    <ContextMenu>
                      <ContextMenuTrigger className="w-full">
                        {renamingExtension?.id === extension.id ? (
                          <div className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors w-full text-foreground bg-muted/80">
                            {extension.icon && (
                              <span className="text-base leading-none flex-shrink-0">
                                {extension.icon}
                              </span>
                            )}
                            <span
                              ref={
                                renamingExtension?.id === extension.id
                                  ? editableRef
                                  : null
                              }
                              contentEditable={true}
                              suppressContentEditableWarning={true}
                              className="flex-1 outline-none cursor-text"
                              data-extension-id={extension.id}
                              tabIndex={0}
                              spellCheck={false}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const newText =
                                    e.currentTarget.textContent || ""
                                  setNewSlug(newText)
                                  handleConfirmRename()
                                } else if (e.key === "Escape") {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  // Reset content to original value
                                  e.currentTarget.textContent =
                                    renamingExtension?.currentSlug || ""
                                  handleCancelRename()
                                }
                                // For all other keys, let the default behavior happen (typing)
                              }}
                              onBlur={(e) => {
                                const newText =
                                  e.currentTarget.textContent || ""
                                setNewSlug(newText)
                                if (!isRenaming) {
                                  handleConfirmRename()
                                }
                              }}
                              onInput={(e) => {
                                // Update React state as user types, but don't interfere with contentEditable
                                const newText =
                                  e.currentTarget.textContent || ""
                                setNewSlug(newText)
                              }}
                            >
                              {/* Initial content set by useEffect, then controlled by user input */}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              .{extension.type === "script" ? "ts" : "tsx"}
                            </span>
                          </div>
                        ) : (
                          <Link
                            to={`/${space}/extensions/${extension.id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors w-full text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                              isActive ? "bg-muted/80" : "hover:bg-muted/80"
                            )}
                            onKeyDown={(e) => {
                              // Keyboard shortcuts for rename:
                              // - Enter: Trigger rename (primary shortcut)
                              // - F2: Trigger rename (Windows/VS Code pattern)
                              if (e.key === "Enter") {
                                e.preventDefault()
                                e.stopPropagation()
                                handleRenameExtension(
                                  extension.id,
                                  extension.slug
                                )
                              } else if (e.key === "F2") {
                                e.preventDefault()
                                e.stopPropagation()
                                handleRenameExtension(
                                  extension.id,
                                  extension.slug
                                )
                              }
                              // Let other keys (like Enter alone) work normally for navigation
                            }}
                          >
                            {extension.icon && (
                              <span className="text-base leading-none flex-shrink-0">
                                {extension.icon}
                              </span>
                            )}
                            <span className="flex-1 truncate">
                              {extension.slug}.
                              {extension.type === "script" ? "ts" : "tsx"}
                            </span>
                          </Link>
                        )}
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem
                          onSelect={() =>
                            handleRenameExtension(extension.id, extension.slug)
                          }
                        >
                          <PencilLineIcon className="mr-2 h-4 w-4" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => handleDeleteExtension(extension.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2Icon className="mr-2 h-4 w-4" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                )
              })}

              {filteredExtensions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
                  <div className="text-muted-foreground text-xs mb-2">
                    {searchTerm
                      ? "No matching extensions"
                      : "No extensions found"}
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
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
