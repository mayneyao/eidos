"use client"

import React from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"

import { ExtensionContextMenu } from "./extension-context-menu"
import { FileContextMenu } from "./file-context-menu"
import { NodeContextMenu } from "./node-context-menu"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface FileTreeContextMenuProps {
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
  onCopySlug?: (node: FileTreeNode) => void
  onCopyExtension?: (node: FileTreeNode) => void
  onShareExtension?: (node: FileTreeNode) => void
  onCopyExtensionCode?: (node: FileTreeNode) => void
  onOpenExtensionStandalone?: (node: FileTreeNode) => void
  onOpenExtensionDefaultBrowser?: (node: FileTreeNode) => void
  isMultiSelection?: boolean
  selectionCount?: number
  selectionHasDataview?: boolean
}

/**
 * Context menu router for FileTree nodes
 * Routes to appropriate context menu component based on node type
 */
export const FileTreeContextMenu = ({
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
  onCopySlug,
  onCopyExtension,
  onShareExtension,
  onCopyExtensionCode,
  onOpenExtensionStandalone,
  onOpenExtensionDefaultBrowser,
  isMultiSelection = false,
  selectionCount = 1,
  selectionHasDataview = false,
}: FileTreeContextMenuProps) => {
  const nodeType = node.metadata?.nodeType
  const isExtension = nodeType === "extension"

  // For regular files (no metadata), show minimal context menu
  if (!nodeType) {
    return (
      <FileContextMenu
        node={node}
        onOpenInNewTab={onOpenInNewTab}
        isMultiSelection={isMultiSelection}
        selectionCount={selectionCount}
        selectionHasDataview={selectionHasDataview}
      // onRename={onRename}
      // onDelete={onDelete}
      >
        {children}
      </FileContextMenu>
    )
  }

  // For extensions, show extension-specific menu
  if (isExtension) {
    return (
      <ExtensionContextMenu
        node={node}
        onRename={onRename}
        onDelete={onDelete}
        onCopySlug={onCopySlug}
        onCopy={onCopyExtension}
        onOpenInNewTab={onOpenInNewTab}
        onShare={onShareExtension}
        onCopyCode={onCopyExtensionCode}
        onOpenStandalone={onOpenExtensionStandalone}
        onOpenDefaultBrowser={onOpenExtensionDefaultBrowser}
        isMultiSelection={isMultiSelection}
        selectionCount={selectionCount}
      >
        {children}
      </ExtensionContextMenu>
    )
  }

  // For nodes (table, doc, folder, etc.), show node-specific menu
  return (
    <NodeContextMenu
      node={node}
      onRename={onRename}
      onDelete={onDelete}
      onPin={onPin}
      onUnpin={onUnpin}
      onAddToChat={onAddToChat}
      onCreateDoc={onCreateDoc}
      onCreateTable={onCreateTable}
      onCreateFolder={onCreateFolder}
      onOpenInNewTab={onOpenInNewTab}
      isMultiSelection={isMultiSelection}
      selectionCount={selectionCount}
      selectionHasDataview={selectionHasDataview}
    >
      {children}
    </NodeContextMenu>
  )
}
