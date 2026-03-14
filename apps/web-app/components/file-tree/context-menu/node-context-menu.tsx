"use client"

import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  CopyIcon,
  ExternalLinkIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuShortcut,
  NativeContextMenuSub as ContextMenuSub,
  NativeContextMenuSubContent as ContextMenuSubContent,
  NativeContextMenuSubTrigger as ContextMenuSubTrigger,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCopyTableSchema } from "../../node-menu/node-export"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface NodeContextMenuProps {
  node: FileTreeNode
  children: React.ReactNode
  onRename?: (node: FileTreeNode) => void
  onDelete?: (node: FileTreeNode) => void
  onPin?: (node: FileTreeNode) => void
  onUnpin?: (node: FileTreeNode) => void
  onAddToChat?: (node: FileTreeNode) => void
  onCreateDoc?: (parentNode: FileTreeNode) => void
  onCreateTable?: (parentNode: FileTreeNode) => void
  onCreateFolder?: (parentNode: FileTreeNode) => void
  onOpenInNewTab?: (node: FileTreeNode) => void
  isMultiSelection?: boolean
  selectionCount?: number
  selectionHasDataview?: boolean
}

const CopyTableSchemaWrapper = ({ tableId }: { tableId: string }) => {
  const { copyTableSchema } = useCopyTableSchema()
  const { t } = useTranslation()

  return (
    <ContextMenuItem onClick={() => copyTableSchema(tableId)}>
      <Share2Icon className="mr-2 h-4 w-4" />
      {t("common.copySchema", "Copy Schema")}
    </ContextMenuItem>
  )
}

/**
 * Context menu specifically for node types (table, doc, folder, etc.)
 */
export const NodeContextMenu = ({
  node,
  children,
  onRename,
  onDelete,
  onPin,
  onUnpin,
  onAddToChat,
  onCreateDoc,
  onCreateTable,
  onCreateFolder,
  onOpenInNewTab,
  isMultiSelection = false,
  selectionCount = 1,
  selectionHasDataview = false,
}: NodeContextMenuProps) => {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const isPinned = node.metadata?.isPinned
  const isFolder =
    node.kind === "directory" || node.metadata?.nodeType === "folder"

  // Calculate which menu items to show
  const hasRename = !!onRename && !isMultiSelection
  const hasPin = (isPinned ? !!onUnpin : !!onPin) && !isMultiSelection
  const hasAddToChat = !!onAddToChat && !isMultiSelection
  const hasOpenInNewTab = !!onOpenInNewTab && !isMultiSelection
  const hasCreate =
    isFolder &&
    !!(onCreateDoc || onCreateTable || onCreateFolder) &&
    !isMultiSelection
  const hasDelete = !!onDelete

  // Calculate sections
  const hasTopSection = hasRename || hasPin || hasAddToChat
  const hasOpenSection = hasOpenInNewTab
  const hasBottomSection = hasDelete

  // Don't render context menu if there are no items to show
  if (!hasTopSection && !hasCreate && !hasOpenSection && !hasBottomSection) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Create operations */}
        {hasCreate && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderPlusIcon className="mr-2 h-4 w-4" />
              {t("node.menu.new", "New")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {onCreateDoc && (
                <ContextMenuItem onClick={() => onCreateDoc(node)}>
                  <FileIcon className="mr-2 h-4 w-4" />
                  {t("node.menu.newDoc", "New Doc")}
                </ContextMenuItem>
              )}
              {onCreateTable && (
                <ContextMenuItem onClick={() => onCreateTable(node)}>
                  <FileSpreadsheetIcon className="mr-2 h-4 w-4" />
                  {t("node.menu.newTable", "New Table")}
                </ContextMenuItem>
              )}
              {onCreateFolder && (
                <ContextMenuItem onClick={() => onCreateFolder(node)}>
                  <FolderPlusIcon className="mr-2 h-4 w-4" />
                  {t("node.menu.newFolder", "New Folder")}
                </ContextMenuItem>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Open in new tab */}
        {hasOpenInNewTab && (
          <>
            {/* Show separator if there are create items above */}
            {hasCreate && <ContextMenuSeparator />}
            <ContextMenuItem onClick={() => onOpenInNewTab(node)}>
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              {t("node.menu.openInNewTab", "Open in New Tab")}
            </ContextMenuItem>
          </>
        )}

        {/* Medium-risk operations */}
        {(hasPin || hasAddToChat) && (
          <>
            {/* Show separator if there are create or open items above */}
            {(hasCreate || hasOpenInNewTab) && <ContextMenuSeparator />}

            {hasPin &&
              (isPinned
                ? onUnpin && (
                    <ContextMenuItem onClick={() => onUnpin(node)}>
                      <PinOffIcon className="mr-2 h-4 w-4" />
                      {t("node.menu.unpin", "Unpin")}
                    </ContextMenuItem>
                  )
                : onPin && (
                    <ContextMenuItem onClick={() => onPin(node)}>
                      <PinIcon className="mr-2 h-4 w-4" />
                      {t("node.menu.pin", "Pin")}
                    </ContextMenuItem>
                  ))}

            {hasAddToChat && (
              <ContextMenuItem onClick={() => onAddToChat(node)}>
                <MessageSquareIcon className="mr-2 h-4 w-4" />
                {t("node.menu.addToChat", "Add to Chat")}
              </ContextMenuItem>
            )}
            {node.metadata?.nodeId && (
              <ContextMenuItem
                onClick={() => {
                  if (node.metadata?.nodeId) {
                    navigator.clipboard.writeText(node.metadata.nodeId)
                    toast({
                      description: t(
                        "node.menu.copyIdSuccess",
                        "Node ID copied to clipboard"
                      ),
                    })
                  }
                }}
              >
                <CopyIcon className="mr-2 h-4 w-4" />
                {t("node.menu.copyId", "Copy ID")}
              </ContextMenuItem>
            )}
            {node.metadata?.nodeType === "table" && node.metadata?.nodeId && (
              <CopyTableSchemaWrapper tableId={node.metadata.nodeId} />
            )}
          </>
        )}

        {/* Rename and delete operations */}
        {(hasRename || hasDelete) && (
          <>
            {/* Show separator if there are other items above */}
            {(hasCreate || hasPin || hasAddToChat) && <ContextMenuSeparator />}

            {hasRename && (
              <ContextMenuItem onClick={() => onRename(node)}>
                <PencilLineIcon className="mr-2 h-4 w-4" />
                <span className="flex-1">
                  {t("node.menu.rename", "Rename")}
                </span>
                <NativeContextMenuShortcut>F2</NativeContextMenuShortcut>
              </ContextMenuItem>
            )}

            {hasDelete && (
              <ContextMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {t("common.delete", "Delete")}
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>

      {/* Delete confirmation for nodes (including multi-selection) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectionCount > 1
                ? t("node.menu.deleteMultipleTitle", "Delete selected items?")
                : t("node.menu.deleteSingleTitle", "Delete item?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const count = selectionCount
                const base =
                  count === 1
                    ? t(
                        "node.menu.deleteDescSingle",
                        "This will delete 1 item."
                      )
                    : t(
                        "node.menu.deleteDescMultiple",
                        `This will delete ${count} items.`
                      )
                if (selectionHasDataview) {
                  return (
                    base +
                    " " +
                    t(
                      "node.menu.deleteDataviewNotice",
                      "Regular items can be restored from Trash, but dataview items will be permanently removed."
                    )
                  )
                }
                return (
                  base +
                  " " +
                  t(
                    "node.menu.deleteRecoverable",
                    "You can restore them from Trash."
                  )
                )
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteDialogOpen(false)
                onDelete?.(node)
              }}
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}
