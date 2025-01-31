import { useEffect } from "react"
import { Wand2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { isInkServiceMode } from "@/lib/env"
import { useCurrentNode, useNodeMap } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEmoji } from "@/hooks/use-emoji"
import { useNode } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { DocProperty } from "@/components/doc-property"
import { Editor } from "@/components/doc/editor"
import { FolderTree } from "@/components/folder"
import { Table } from "@/components/table"

import { DefaultColors } from "../../../../components/file-selector"
import { useGenerateTitle } from "./hooks/use-generate-title"
import { NodeCover } from "./node-cover"
import { NodeIconEditor } from "./node-icon"
import { NodeRestore } from "./node-restore"

export const NodeComponent = ({
  nodeId,
  isRootPage,
}: {
  nodeId?: string
  isRootPage?: boolean
}) => {
  const { t } = useTranslation()
  const params = useCurrentPathInfo()
  const { updateNodeName } = useSqlite(params.database)
  const { tableName } = params
  const nodeMap = useNodeMap()
  const { updateUiColumns } = useUiColumns(tableName)

  const { getEmoji } = useEmoji()
  const { updateIcon, updateCover, updateHideProperties } = useNode()
  const { generateTitle, isLoading: isTitleGenerating } = useGenerateTitle()
  const { getDocMarkdown } = useSqlite()

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (
          [
            DataUpdateSignalType.AddColumn,
            DataUpdateSignalType.UpdateColumn,
          ].includes(payload.type)
        ) {
          switch (payload.type) {
            case DataUpdateSignalType.AddColumn:
            case DataUpdateSignalType.UpdateColumn:
              updateUiColumns(table)
              break
          }
        }
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
    }
  }, [updateUiColumns])

  if (isRootPage) {
    return <FolderTree folderId={undefined} />
  }
  if (!nodeId) {
    return null
  }
  const node = nodeMap[nodeId]
  const parentNode = node.parent_id ? nodeMap[node.parent_id] : null
  const handleAddIcon = async () => {
    const emojiNative = await getEmoji(node?.name)
    await updateIcon(node?.id!, emojiNative)
  }
  const handleAddCover = async () => {
    const color =
      DefaultColors[Math.floor(Math.random() * DefaultColors.length)]
    await updateCover(node?.id!, `color://${color}`)
  }

  const toggleProperties = async () => {
    await updateHideProperties(node?.id!, !node?.hide_properties)
  }
  const isReadOnly = node.is_locked || isInkServiceMode

  const handleGenerateTitle = async () => {
    if (!node?.id) return

    const docContent = await getDocMarkdown(node.id)
    if (!docContent) return
    try {
      const newTitle = await generateTitle(docContent)
      console.log("newTitle", newTitle)
      if (newTitle) {
        await updateNodeName(node.id, newTitle)
      }
    } catch (error) {
      console.error("Failed to generate title:", error)
      toast({
        title: t("common.error"),
        description: t("common.error.tryAgainLater"),
      })
    }
  }

  return (
    <>
      <NodeRestore node={node} />
      {node?.type === "table" && (
        <Table
          tableName={params.tableName!}
          space={params.database!}
          isReadOnly={isReadOnly}
        />
      )}
      {node?.type === "doc" && (
        <Editor
          isActive
          isEditable={isReadOnly ? false : true}
          docId={node.id}
          title={node.name}
          showTitle
          className={node.is_full_width ? "max-w-full md:!px-12" : ""}
          onTitleChange={(title) => {
            updateNodeName(node.id, title)
          }}
          beforeTitle={
            node.icon && <NodeIconEditor icon={node.icon} nodeId={node.id} />
          }
          coverComponent={node.cover && <NodeCover node={node} />}
          propertyComponent={
            parentNode?.type === "table" &&
            !node.hide_properties && (
              <DocProperty tableId={node.parent_id!} docId={node.id} />
            )
          }
          topComponent={
            <div className="flex h-[28px] cursor-pointer gap-2 opacity-100 hover:opacity-100 sm:opacity-0">
              {!isReadOnly && (
                <>
                  {!node.icon && (
                    <Button size="xs" variant="ghost" onClick={handleAddIcon}>
                      {t("doc.addIcon")}
                    </Button>
                  )}
                  {!node.cover && (
                    <Button size="xs" variant="ghost" onClick={handleAddCover}>
                      {t("doc.addCover")}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={handleGenerateTitle}
                    disabled={isTitleGenerating}
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    {t("doc.generateTitle")}
                  </Button>
                </>
              )}
              {parentNode?.type === "table" && (
                <Button size="xs" variant="ghost" onClick={toggleProperties}>
                  {node.hide_properties
                    ? t("doc.showProperties")
                    : t("doc.hideProperties")}
                </Button>
              )}
            </div>
          }
        />
      )}
      {node?.type === "folder" && <FolderTree folderId={node.id} />}
    </>
  )
}
export default function TablePage() {
  const node = useCurrentNode()
  const { table: nodeId } = useParams()
  return <NodeComponent nodeId={node?.id} isRootPage={nodeId === "~"} />
}
