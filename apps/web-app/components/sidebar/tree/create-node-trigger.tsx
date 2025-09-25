import { TreeNodeType, type ITreeNode } from "@/packages/core/types/ITreeNode"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { isDesktopMode } from "@/lib/env"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAllExtNodes } from "@/apps/web-app/hooks/use-all-ext-nodes"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const CreateNodeTrigger = ({ parent_id }: { parent_id?: string }) => {
  const { space } = useCurrentPathInfo()
  const { t } = useTranslation()

  const { extNodes } = useAllExtNodes()

  const { createDoc, createTable, createFolder, createExtNode, createView } =
    useSqlite(space)
  const goto = useGoto()

  const handleCreateDoc = async () => {
    const docId = await createDoc("", parent_id)
    goto(space, docId)
  }

  const handleCreateTable = async () => {
    const tableId = await createTable("", parent_id)
    goto(space, tableId)
  }

  const handlerCreateFolder = async () => {
    const folderId = await createFolder(parent_id)
    console.log("create folder")
  }

  const handleCreateView = async () => {
    const viewId = await createView(parent_id)
    console.log("create view")
    goto(space, viewId)
  }

  const handleCreateExtNode = async (type: ITreeNode["type"]) => {
    const nodeType = type.startsWith("ext__") ? type.split("ext__")[1] : type
    const extNode = extNodes.find(
      (node) => node.meta?.extNode?.type === nodeType
    )
    if (!extNode) return
    console.log("creating ", extNode)
    const extNodeId = await createExtNode(nodeType, parent_id)
    console.log("extNodeId", extNodeId)
    if (!extNodeId) return
    goto(space, extNodeId)
  }

  const handleImportCsv = async (file: File) => {
    if (isDesktopMode) {
      await window.eidos.invoke("reload-query-worker")
    }
    const tableId = await sqlite?.importCsv({
      name: file.name,
      content: await file.text(),
    })
    if (tableId) {
      goto(space, tableId)
    }
  }

  const handleImportMarkdown = async (file: File) => {
    const docId = await sqlite?.importMarkdown({
      name: file.name,
      content: await file.text(),
    })
    if (docId) {
      goto(space, docId)
    }
  }

  const triggerFileInput = (accept: string, handler: (file: File) => void) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handler(file)
      }
    }
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }

  const handleCreateNode = (type: ITreeNode["type"]) => {
    switch (type) {
      case TreeNodeType.Table:
        handleCreateTable()
        break
      case TreeNodeType.Doc:
        handleCreateDoc()
        break
      case TreeNodeType.Folder:
        handlerCreateFolder()
        break
      case TreeNodeType.Dataview:
        handleCreateView()
        break
      default:
        handleCreateExtNode(type)
        break
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            handleCreateNode(TreeNodeType.Doc)
          }}
        >
          {t("node.menu.newDoc")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            handleCreateNode(TreeNodeType.Table)
          }}
        >
          {t("node.menu.newTable")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            handleCreateNode(TreeNodeType.Folder)
          }}
        >
          {t("node.menu.newFolder")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            handleCreateNode(TreeNodeType.Dataview)
          }}
        >
          {t("node.menu.newDataView")}
          <span className="mx-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
            {t("common.badge.alpha")}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            triggerFileInput('.csv', handleImportCsv)
          }}
        >
          {t("sidebar.importFile.importCSV")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            triggerFileInput('.md,.markdown', handleImportMarkdown)
          }}
        >
          {t("sidebar.importFile.importMarkdown")}
        </DropdownMenuItem>
        {extNodes.length > 0 && <DropdownMenuSeparator />}
        {extNodes.map((node) => {
          const firstHandler = node.meta?.extNode?.type
          return (
            <DropdownMenuItem
              key={node.id}
              onClick={() => {
                handleCreateExtNode(`ext__${firstHandler}` as `ext__${string}`)
              }}
            >
              {t("node.menu.newExtNode", { name: node.name })}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
