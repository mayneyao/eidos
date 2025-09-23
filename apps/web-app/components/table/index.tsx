import { ViewTypeEnum } from "@/packages/core/types/IView"
import { useEffect, useMemo, useState } from "react"

import { useSqliteTableSubscribe } from "@/apps/web-app/hooks/use-sqlite-table-subscribe"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { useTableOperation } from "@/hooks/use-table"
import { getTableIdByRawTableName } from "@/lib/utils"

import { ExtTableViewBlockApp } from "../block-renderer/ext-table-view-block-app"
import { FieldEditor } from "./fields"
import { TABLE_CONTENT_ELEMENT_ID } from "./helper"
import { TableContext, useUDFs } from "./hooks"
import { useTableViewInfoByExtType } from "./hooks/use-custom-table-views"
import { TableStoreProvider } from "./table-store-provider"
import { ViewToolbar } from "./view-toolbar"
import { DocListView } from "./views/doc-list"
import GalleryView from "./views/gallery"
import GridView from "./views/grid"
import { GridViewForView } from "./views/grid/grid-for-view"
import KanbanView from "./views/kanban"

// const GalleryView = React.lazy(() => import("./views/gallery"))

interface ITableProps {
  space: string
  tableName: string
  viewId?: string
  isEmbed?: boolean
  isEditable?: boolean
  isReadOnly?: boolean
}

export const Table = ({
  tableName,
  space,
  viewId,
  isEmbed,
  isEditable,
  isReadOnly,
}: ITableProps) => {
  const [currentViewId, setCurrentViewId] = useState<string | undefined>(viewId)
  const udfs = useUDFs()

  const { updateUiColumns } = useUiColumns(tableName, space)
  const { updateViews, views } = useTableOperation(tableName, space)
  useEffect(() => {
    updateUiColumns(tableName)
  }, [updateUiColumns, tableName])

  useEffect(() => {
    updateViews()
  }, [updateViews, tableName])

  const currentView = useMemo(() => {
    if (currentViewId) {
      return views.find((v) => v.id === currentViewId)
    }
    return views[0]
  }, [views, currentViewId])

  const extView = useTableViewInfoByExtType(currentView?.type)
  const isView = tableName.startsWith("vw_")
  const isExtView = currentView?.type?.startsWith("ext__")

  useSqliteTableSubscribe(tableName)
  return (
    <TableStoreProvider>
      <TableContext.Provider
        value={{
          tableName,
          space,
          viewId: currentViewId,
          setViewId: setCurrentViewId,
          isReadOnly,
          isView,
          isEmbed,
          udfs,
        }}
      >
        <div className="h-full w-full overflow-hidden p-2 pt-0 flex flex-col">
          <ViewToolbar
            tableName={tableName}
            space={space}
            isReadOnly={isReadOnly}
          />
          <div
            className="relative flex-grow overflow-hidden"
            id={TABLE_CONTENT_ELEMENT_ID}
          >
            {currentView?.type === ViewTypeEnum.Grid &&
              (isView ? (
                <GridViewForView
                  tableName={tableName!}
                  databaseName={space}
                  view={currentView}
                  isEmbed={isEmbed}
                />
              ) : (
                <GridView
                  tableName={tableName}
                  databaseName={space}
                  view={currentView}
                  isEmbed={isEmbed}
                />
              ))}
            {currentView?.type === ViewTypeEnum.Gallery && (
              <GalleryView
                space={space}
                tableName={tableName}
                view={currentView}
              />
            )}
            {currentView?.type === ViewTypeEnum.Kanban && (
              <KanbanView
                space={space}
                tableName={tableName}
                view={currentView}
              />
            )}
            {currentView?.type === ViewTypeEnum.DocList && (
              <DocListView
                space={space}
                tableName={tableName}
                view={currentView}
              />
            )}
            {isExtView && extView && (
              <ExtTableViewBlockApp
                space={space}
                blockId={extView?.id ?? null}
                tableId={getTableIdByRawTableName(tableName)}
                viewId={currentView?.id || ""}
              />
            )}
            <FieldEditor
              tableName={tableName}
              databaseName={space}
              view={currentView!}
            />
          </div>
        </div>
      </TableContext.Provider>
    </TableStoreProvider>
  )
}
