import { useEffect } from "react"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
} from "@/lib/const"
import { isInkServiceMode } from "@/lib/env"
import { isDayPageId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { ExtNodeBlockApp } from "@/components/block-renderer/ext-node-block-app"
import { DataView } from "@/components/dataview"
import { PropertyTabs } from "@/components/doc-property-global/property-tabs"
import { Editor } from "@/components/doc/editor"
import { DefaultColors } from "@/components/file-selector"
import { FolderTree } from "@/components/folder"
import { Table } from "@/components/table"
import {
  useCurrentExtNodeHandleBlockId,
  useCurrentNode,
  useNodeMap,
} from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEmoji } from "@/apps/web-app/hooks/use-emoji"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { EverydayPageContent } from "../everyday/[day]/page"
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

  const handleBlockId = useCurrentExtNodeHandleBlockId()
  const { getEmoji } = useEmoji()
  const { updateIcon, updateCover, updateHideProperties } = useNode()
  const { space } = useCurrentPathInfo()

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


  return (
    <>
      <NodeRestore node={node} />
      {node?.type === TreeNodeType.Dataview && <DataView nodeId={nodeId} />}
      {node?.type.startsWith("ext__") && (
        <div className="flex h-full w-full">
          <ExtNodeBlockApp
            space={space}
            blockId={handleBlockId || null}
            nodeId={nodeId}
          />
        </div>
      )}
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
            <div
              className={
                node.is_full_width ? "w-full max-w-full md:!px-12" : "w-full"
              }
            >
              {node?.type === "doc" && !node.hide_properties && (
                <PropertyTabs docId={node.id} parentNode={parentNode} />
              )}
            </div>
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
                </>
              )}
              {node?.type === "doc" && (
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
  const isDayPage = isDayPageId(nodeId)
  const { space } = useCurrentPathInfo()

  if (isDayPage) {
    return <EverydayPageContent day={nodeId} database={space} />
  }
  return <NodeComponent nodeId={node?.id} isRootPage={nodeId === "~"} />
}
