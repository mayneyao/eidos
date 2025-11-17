import React from "react"
import { ChevronDown, ChevronRight, Pin } from "lucide-react"

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
  isVirtualNode: boolean
  isPinned: boolean
  onToggle: () => void
  onFileClick: () => void
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
  onCopySlug?: (node: FileTreeNodeType) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnter?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  renderChild: (child: FileTreeNodeType, childLevel: number) => React.ReactNode
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
  isVirtualNode,
  isPinned,
  onToggle,
  onFileClick,
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
  onCopySlug,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  renderChild,
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
          hasChildren && node.metadata?.nodeType === "folder"
            ? onCreateDoc
            : undefined
        }
        onCreateTable={
          hasChildren && node.metadata?.nodeType === "folder"
            ? onCreateTable
            : undefined
        }
        onCreateFolder={
          hasChildren && node.metadata?.nodeType === "folder"
            ? onCreateFolder
            : undefined
        }
        onCopySlug={
          node.metadata?.nodeType === "extension" ? onCopySlug : undefined
        }
      >
        <div
          className={`flex items-center rounded transition-colors cursor-pointer select-none ${
            isSelected ? "bg-accent" : "hover:bg-accent"
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
          onClick={() => {
            if (hasChildren) {
              onToggle()
            } else {
              onFileClick()
            }
          }}
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
          <div className="flex items-center gap-1 px-2 py-1 min-w-0 flex-1">
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
        </div>
      </FileTreeContextMenu>
      {hasChildren && isExpanded && node.children && (
        <div className="ml-0">
          {node.children.map((child) => renderChild(child, level + 1))}
        </div>
      )}
    </div>
  )
}
