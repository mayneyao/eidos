"use client"

import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import type { FileActionMeta, FileHandlerMeta, IExtension } from "@/packages/core/types/IExtension"
import { FileIcon, FolderOpen, PencilLineIcon, Trash2Icon, ZapIcon } from "lucide-react"
import React from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import {
  getFileExtension,
  useFileHandlers,
} from "@/hooks/use-file-handlers"
import { useFileActions } from "@/hooks/use-file-actions"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useScriptFunction } from "@/components/script-container/hook"
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
  const { handlers, isLoading: isLoadingHandlers } = useFileHandlers(fileExtension)
  const { fileActions, isLoading: isLoadingActions } = useFileActions(fileExtension)
  const { callFunction } = useScriptFunction()
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite()

  const hasMultipleHandlers = handlers.length > 1
  const showOpenWith = !isLoadingHandlers && hasMultipleHandlers
  const showFileActions = !isLoadingActions && fileActions.length > 0
  const hasRenameOrDelete = !!(onRename || onDelete)
  const isFolder = node.kind === "directory"
  // Only show "Open in Finder/Explorer" if it's a folder and we are in the desktop app (window.eidos exists)
  const showOpenFolder = isFolder && typeof window !== "undefined" && !!(window as any).eidos

  const hasAnyMenuItems = showOpenWith || showFileActions || hasRenameOrDelete || showOpenFolder

  const handleFileAction = async (action: IExtension<FileActionMeta>) => {
    await callFunction({
      input: { filePath: node.path },
      command: action.meta!.funcName,
      context: {},
      code: action.code,
      id: action.id,
      space: space,
      bindings: action.bindings,
    })
  }

  const handleOpenWith = (handler: IExtension<FileHandlerMeta>) => {
    // Navigate to file handler page with handler ID in query parameter
    // This is a temporary selection, not saved as default handler
    navigate(`/file-handler?handler=${handler.id}#${node.path}`)
  }

  const handleOpenFolder = async () => {
    try {
      const eidos = window.eidos
      if (!eidos) return

      let absolutePath = ""
      if (node.path.startsWith("~/")) {
        const spaceInfo = await eidos.invoke("get-current-space")
        if (spaceInfo && spaceInfo.path) {
          // Remove ~/ and join with space path
          // node.path is like "~/docs/folder", we want "docs/folder"
          const relativePath = node.path.substring(2)
          // We can't use path.join here because it's browser env, so simple string concatenation
          // Assuming spaceInfo.path doesn't end with / and relativePath doesn't start with /
          // But let's be safe
          const root = spaceInfo.path.endsWith("/") ? spaceInfo.path : `${spaceInfo.path}/`
          absolutePath = `${root}${relativePath}`
        }
      } else if (node.path.startsWith("@/")) {
        // Mounted folder: @/mountName/... format
        const parts = node.path.substring(2).split("/")
        const mountName = parts[0]

        if (!mountName) {
          console.warn("Invalid mounted path: missing mount name")
          return
        }

        // Resolve mount path using sqlite.kv.get
        if (!sqlite) {
          console.error("Database not available")
          return
        }

        const mountKey = `eidos:space:files:mount:${mountName}`
        const mountPath = await sqlite.kv.get(mountKey, 'text')

        if (!mountPath) {
          console.error(`Mount not found: ${mountName}`)
          return
        }

        const relativePath = parts.slice(1).join("/")

        // Join mount path with relative path
        // Use simple string concatenation since we're in browser env
        if (relativePath) {
          const root = mountPath.endsWith("/") ? mountPath : `${mountPath}/`
          absolutePath = `${root}${relativePath}`
        } else {
          absolutePath = mountPath
        }
      } else {
        console.warn("Unsupported path format for opening folder:", node.path)
        return
      }

      if (absolutePath) {
        await eidos.openFolder(absolutePath)
      }
    } catch (error) {
      console.error("Failed to open folder:", error)
    }
  }

  // Don't render context menu if there are no items to show
  if (!hasAnyMenuItems) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
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
                      onClick={() => handleOpenWith(handler)}
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

        {showOpenWith && (showFileActions || hasRenameOrDelete || showOpenFolder) && (
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
                      onClick={() => handleFileAction(action)}
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

        {showFileActions && (hasRenameOrDelete || showOpenFolder) && <ContextMenuSeparator />}

        {showOpenFolder && (
          <ContextMenuItem onClick={handleOpenFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("file.menu.openInFileManager", "Open in File Manager")}
          </ContextMenuItem>
        )}

        {showOpenFolder && hasRenameOrDelete && <ContextMenuSeparator />}

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

