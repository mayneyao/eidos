"use client"

import React from "react"
import type {
  FileActionMeta,
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  FileIcon,
  FolderOpen,
  PencilLineIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { useFileActions } from "@/hooks/use-file-actions"
import { getFileExtension, useFileHandlers } from "@/hooks/use-file-handlers"
import { useFileItemActions } from "@/hooks/use-file-item-actions"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useScriptFunction } from "@/components/script-container/hook"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface FileContextMenuProps {
  node: FileTreeNode
  children: React.ReactNode
  onRename?: (node: FileTreeNode) => void
  onDelete?: (node: FileTreeNode) => void
}

/**
 * Context menu for regular files (no metadata.nodeType)
 * Provides menu with rename, delete, and "Open with" options
 */
export const FileContextMenu = ({
  node,
  children,
  onRename,
  onDelete,
}: FileContextMenuProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileExtension = getFileExtension(node.path)
  const { handlers, isLoading: isLoadingHandlers } =
    useFileHandlers(fileExtension)
  const { fileActions, isLoading: isLoadingActions } =
    useFileActions(fileExtension)
  const { space } = useCurrentPathInfo()

  const fileActionsContext = {
    filePath: node.path,
    space,
    navigate,
  }

  const { openInFileManager, openWith, executeFileAction } = useFileItemActions(fileActionsContext)

  const hasMultipleHandlers = handlers.length > 1
  const showOpenWith = !isLoadingHandlers && hasMultipleHandlers
  const showFileActions = !isLoadingActions && fileActions.length > 0
  const hasRenameOrDelete = !!(onRename || onDelete)
  const isFolder = node.kind === "directory"
  // Show "Open in File Manager" for all items (files and folders) in desktop app
  const showOpenFolder =
    typeof window !== "undefined" && !!(window as any).eidos

  const hasAnyMenuItems =
    showOpenWith || showFileActions || hasRenameOrDelete || showOpenFolder


  // Don't render context menu if there are no items to show
  if (!hasAnyMenuItems) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {showOpenFolder && (
          <ContextMenuItem onClick={openInFileManager}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("file.menu.openInFileManager", "Open in File Manager")}
          </ContextMenuItem>
        )}
        {/* Open with submenu (only show if multiple handlers available) */}
        {showOpenWith && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FileIcon className="mr-2 h-4 w-4" />
                {t("file.menu.openWith", "Open with")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {handlers.map((handler) => {
                  const meta = handler.meta as FileHandlerMeta
                  return (
                    <ContextMenuItem
                      key={handler.id}
                      onClick={() => openWith(handler)}
                    >
                      {meta.fileHandler.icon && (
                        <span className="mr-2">{meta.fileHandler.icon}</span>
                      )}
                      {meta.fileHandler.title || handler.name}
                    </ContextMenuItem>
                  )
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {showOpenWith &&
          (showFileActions || hasRenameOrDelete || showOpenFolder) && (
            <ContextMenuSeparator />
          )}

        {/* File Actions submenu */}
        {showFileActions && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ZapIcon className="mr-2 h-4 w-4" />
                {t("file.menu.actions", "File Actions")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {fileActions.map((action) => {
                  const meta = action.meta as FileActionMeta
                  return (
                    <ContextMenuItem
                      key={action.id}
                      onClick={() => executeFileAction(action)}
                    >
                      {meta.fileAction.icon && (
                        <span className="mr-2">{meta.fileAction.icon}</span>
                      )}
                      {meta.fileAction.name || action.name}
                    </ContextMenuItem>
                  )
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {showFileActions && hasRenameOrDelete && <ContextMenuSeparator />}
        {onRename && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <PencilLineIcon className="mr-2 h-4 w-4" />
            {t("node.menu.rename", "Rename")}
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(node)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {t("common.delete", "Delete")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
