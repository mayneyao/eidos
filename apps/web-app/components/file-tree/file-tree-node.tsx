import React from "react"
import { ChevronDown, ChevronRight, Pin } from "lucide-react"

import { ExtNodeBadge } from "@/components/ext-node-badge"

import { FileTreeContextMenu } from "./context-menu"
import { FileTreeIcon } from "./file-tree-icon"
import type { FileTreeNode as FileTreeNodeType } from "./index"
import { InlineEdit } from "./inline-edit"

interface FileTreeNodeProps {
  node: FileTreeNodeType
  level: number
  isExpanded: boolean
  isLoading: boolean
  isSelected: boolean
  isRenaming: boolean
  isDragging: boolean
  isDragOver: boolean
  showPinIcon: boolean
  displayName: string
  nameClassName: string
  hasChildren: boolean
  isActive: boolean
  ariaLevel: number
  ariaSelected: boolean
  ariaExpanded?: boolean
  isVirtualNode: boolean
  isPinned: boolean
  nodeRef?: (el: HTMLDivElement | null) => void
  onToggle: () => void
  onRowClick: (event: React.MouseEvent | React.KeyboardEvent) => void
  onRowKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onRowContextMenu?: (event: React.MouseEvent) => void
  onRename: (node: FileTreeNodeType) => void
  onRenameConfirm: (newName: string) => void
  onRenameCancel: () => void
  onDelete?: (node: FileTreeNodeType) => void
  onPin?: (node: FileTreeNodeType) => void
  onUnpin?: (node: FileTreeNodeType) => void
  onAddToChat?: (node: FileTreeNodeType) => void
  onCreateDoc?: (node: FileTreeNodeType) => void
  onCreateTable?: (node: FileTreeNodeType) => void
  onCreateFolder?: (node: FileTreeNodeType) => void
  onOpenInNewTab?: (node: FileTreeNodeType) => void
  onCopySlug?: (node: FileTreeNodeType) => void
  onCopyExtension?: (node: FileTreeNodeType) => void
  onShareExtension?: (node: FileTreeNodeType) => void
  onCopyExtensionCode?: (node: FileTreeNodeType) => void
  onOpenExtensionStandalone?: (node: FileTreeNodeType) => void
  onOpenExtensionDefaultBrowser?: (node: FileTreeNodeType) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnter?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isMultiSelection: boolean
  selectionCount: number
  selectionHasDataview: boolean
}

export const FileTreeNode = ({
  node,
  level,
  isExpanded,
  isLoading,
  isSelected,
  isRenaming,
  isDragging,
  isDragOver,
  showPinIcon,
  displayName,
  nameClassName,
  hasChildren,
  isActive,
  ariaLevel,
  ariaSelected,
  ariaExpanded,
  isVirtualNode,
  isPinned,
  nodeRef,
  onToggle,
  onRowClick,
  onRowKeyDown,
  onRowContextMenu,
  onRename,
  onRenameConfirm,
  onRenameCancel,
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  isMultiSelection,
  selectionCount,
  selectionHasDataview,
}: FileTreeNodeProps) => {
  const canDrop = hasChildren && !isDragging

  return (
    <div key={node.path} className="min-w-0">
      <FileTreeContextMenu
        node={node}
        onRename={onRename}
        onDelete={isVirtualNode ? onDelete : undefined}
        onPin={isVirtualNode && !isPinned ? onPin : undefined}
        onUnpin={isVirtualNode && isPinned ? onUnpin : undefined}
        onAddToChat={
          isVirtualNode && node.metadata?.nodeType !== "extension"
            ? onAddToChat
            : undefined
        }
        onCreateDoc={
          hasChildren &&
          node.metadata?.nodeType === "folder" &&
          !node.metadata?.isVirtualFolder
            ? onCreateDoc
            : undefined
        }
        onCreateTable={
          hasChildren &&
          node.metadata?.nodeType === "folder" &&
          !node.metadata?.isVirtualFolder
            ? onCreateTable
            : undefined
        }
        onCreateFolder={
          hasChildren &&
          node.metadata?.nodeType === "folder" &&
          !node.metadata?.isVirtualFolder
            ? onCreateFolder
            : undefined
        }
        onOpenInNewTab={onOpenInNewTab}
        onCopySlug={
          node.metadata?.nodeType === "extension" ? onCopySlug : undefined
        }
        onCopyExtension={
          node.metadata?.nodeType === "extension" ? onCopyExtension : undefined
        }
        onShareExtension={
          node.metadata?.nodeType === "extension" ? onShareExtension : undefined
        }
        onCopyExtensionCode={
          node.metadata?.nodeType === "extension"
            ? onCopyExtensionCode
            : undefined
        }
        onOpenExtensionStandalone={
          node.metadata?.nodeType === "extension"
            ? onOpenExtensionStandalone
            : undefined
        }
        onOpenExtensionDefaultBrowser={
          node.metadata?.nodeType === "extension"
            ? onOpenExtensionDefaultBrowser
            : undefined
        }
        isMultiSelection={isMultiSelection}
        selectionCount={selectionCount}
        selectionHasDataview={selectionHasDataview}
      >
        <div
          ref={nodeRef}
          role="treeitem"
          aria-level={ariaLevel}
          aria-selected={ariaSelected}
          aria-expanded={hasChildren ? ariaExpanded : undefined}
          tabIndex={isActive ? 0 : -1}
          className={`flex items-center rounded transition-colors cursor-pointer select-none ${
            isSelected
              ? "bg-primary/10 ring-1 ring-primary/60 shadow-[0_0_0_1px_var(--primary)/20]"
              : "hover:bg-accent"
          } ${isDragging ? "opacity-50" : ""} ${
            isDragOver && canDrop ? "ring-2 ring-primary bg-accent" : ""
          }`}
          draggable={!isRenaming}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={canDrop ? onDragOver : undefined}
          onDragEnter={canDrop ? onDragEnter : undefined}
          onDragLeave={canDrop ? onDragLeave : undefined}
          onDrop={canDrop ? onDrop : undefined}
          onClick={onRowClick}
          onContextMenu={onRowContextMenu}
          onKeyDown={onRowKeyDown}
        >
          <div style={{ width: level * 18 }} className="flex-shrink-0" />
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
                className="p-0 hover:bg-accent rounded transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                ) : isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <FileTreeIcon node={node} />
            )}
          </div>
          <div className="flex items-center justify-between gap-1 px-2 py-1 min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <InlineEdit
                value={displayName}
                isEditing={isRenaming}
                nodeType={node.metadata?.nodeType}
                onConfirm={onRenameConfirm}
                onCancel={onRenameCancel}
                className={nameClassName}
              />
              {!isRenaming && showPinIcon && (
                <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            {!isRenaming && node.metadata?.nodeType?.startsWith("ext__") && (
              <ExtNodeBadge type={node.metadata.nodeType} />
            )}
          </div>
        </div>
      </FileTreeContextMenu>
    </div>
  )
}
