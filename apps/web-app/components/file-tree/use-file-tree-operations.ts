import { useCallback } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import { useNavigate } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { useNode } from "@/hooks/use-nodes"
import { useContextNodes } from "@/components/ai-chat/hooks/use-context-nodes"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useToast } from "@/components/ui/use-toast"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

/**
 * Hook for file tree operations
 * Provides unified handlers for context menu actions
 */
export const useFileTreeOperations = (rootDir?: string) => {
  const { space } = useCurrentPathInfo()
  const { sqlite, createDoc, createTable, createFolder, deleteNode } =
    useSqlite(space)
  const { pin: pinNode, unpin: unpinNode } = useNode()
  const { addNode: addToChat } = useContextNodes()
  const { setIsRightPanelOpen, setCurrentApp } = useSpaceAppStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  const isVirtualNodesPath = rootDir?.startsWith("~/.eidos/__NODES__")
  const isVirtualExtensionsPath = rootDir?.startsWith("~/.eidos/__EXTENSIONS__")

  /**
   * Delete a node
   */
  const handleDelete = useCallback(
    async (node: FileTreeNode) => {
      if (!sqlite) return

      const nodeId = node.metadata?.nodeId
      if (!nodeId) {
        console.warn("Cannot delete node without nodeId")
        return
      }

      try {
        if (isVirtualExtensionsPath) {
          // Delete extension
          await sqlite.extension.del(nodeId)
          // Navigate away if currently viewing this extension
          if (window.location.pathname.includes(nodeId)) {
            navigate("/extensions")
          }
        } else if (isVirtualNodesPath) {
          // Delete node (soft delete)
          await deleteNode({ id: nodeId } as any)
          navigate("/")
        } else {
          // Delete real file - not supported yet
          console.warn("Delete operation for real files is not supported yet")
          toast({
            title: "Not supported",
            description: "Deleting real files is not supported yet",
            variant: "destructive",
          })
          return
        }
      } catch (error) {
        console.error("Failed to delete:", error)
        toast({
          title: "Failed to delete",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [sqlite, isVirtualNodesPath, isVirtualExtensionsPath, deleteNode, navigate, toast]
  )

  /**
   * Pin a node
   */
  const handlePin = useCallback(
    async (node: FileTreeNode) => {
      const nodeId = node.metadata?.nodeId
      if (!nodeId) return

      try {
        pinNode(nodeId)
      } catch (error) {
        console.error("Failed to pin:", error)
        toast({
          title: "Failed to pin",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [pinNode, toast]
  )

  /**
   * Unpin a node
   */
  const handleUnpin = useCallback(
    async (node: FileTreeNode) => {
      const nodeId = node.metadata?.nodeId
      if (!nodeId) return

      try {
        unpinNode(nodeId)
      } catch (error) {
        console.error("Failed to unpin:", error)
        toast({
          title: "Failed to unpin",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [unpinNode, toast]
  )

  /**
   * Add node to chat context
   */
  const handleAddToChat = useCallback(
    (node: FileTreeNode) => {
      const nodeId = node.metadata?.nodeId
      if (!nodeId) return

      // Open right panel if not already open
      setIsRightPanelOpen(true)
      // Set current app to chat
      setCurrentApp("chat")

      // Add the node to chat context (duplicates are handled in the store)
      setTimeout(() => {
        addToChat({
          id: nodeId,
          name: node.name,
          type: node.metadata?.nodeType as any,
        } as any)
      }, 100)
    },
    [addToChat, setIsRightPanelOpen, setCurrentApp]
  )

  /**
   * Create a new doc under parent folder
   */
  const handleCreateDoc = useCallback(
    async (parentNode: FileTreeNode) => {
      const parentId = parentNode.metadata?.nodeId
      if (!createDoc) return

      try {
        const docId = await createDoc("", parentId)
        if (docId) {
          navigate(`/${docId}`)
        }
      } catch (error) {
        console.error("Failed to create doc:", error)
        toast({
          title: "Failed to create doc",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [createDoc, navigate, toast]
  )

  /**
   * Create a new table under parent folder
   */
  const handleCreateTable = useCallback(
    async (parentNode: FileTreeNode) => {
      const parentId = parentNode.metadata?.nodeId
      if (!createTable) return

      try {
        const tableId = await createTable("", parentId)
        if (tableId) {
          navigate(`/${tableId}`)
        }
      } catch (error) {
        console.error("Failed to create table:", error)
        toast({
          title: "Failed to create table",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [createTable, navigate, toast]
  )

  /**
   * Create a new folder under parent folder
   */
  const handleCreateFolder = useCallback(
    async (parentNode: FileTreeNode) => {
      const parentId = parentNode.metadata?.nodeId
      if (!createFolder) return

      try {
        await createFolder(parentId)
      } catch (error) {
        console.error("Failed to create folder:", error)
        toast({
          title: "Failed to create folder",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    },
    [createFolder, toast]
  )

  /**
   * Copy extension slug to clipboard
   */
  const handleCopySlug = useCallback(
    (node: FileTreeNode) => {
      // Extract slug from name (remove file extension)
      const slug = node.name.replace(/\.(ts|tsx)$/, "")
      navigator.clipboard.writeText(slug)
      toast({
        title: "Slug copied to clipboard",
        description: slug,
      })
    },
    [toast]
  )

  return {
    handleDelete,
    handlePin,
    handleUnpin,
    handleAddToChat,
    handleCreateDoc,
    handleCreateTable,
    handleCreateFolder,
    handleCopySlug,
  }
}

