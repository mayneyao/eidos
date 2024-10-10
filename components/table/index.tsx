import { useEffect } from "react"

import { ViewTypeEnum } from "@/lib/store/IView"
import { useSqliteTableSubscribe } from "@/hooks/use-sqlite-table-subscribe"
import { useTableFields } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { TABLE_CONTENT_ELEMENT_ID } from "./helper"
import { TableContext, useCurrentView } from "./hooks"
import { ViewToolbar } from "./view-toolbar"
import { DocListView } from "./views/doc-list"
import GalleryView from "./views/gallery"
import GridView from "./views/grid"
import { FieldEditor } from "./views/grid/fields"

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
  const { currentView } = useCurrentView({
    space,
    tableName,
    viewId,
  })
  const { updateUiColumns } = useUiColumns(tableName, space)

  useEffect(() => {
    updateUiColumns(tableName)
  }, [updateUiColumns, tableName])

  useSqliteTableSubscribe(tableName)
  return (
    <TableContext.Provider value={{ tableName, space, viewId, isReadOnly }}>
      <div className="h-full w-full overflow-hidden p-2 pt-0">
        <ViewToolbar
          tableName={tableName}
          space={space}
          isEmbed={Boolean(isEmbed)}
          isReadOnly={isReadOnly}
        />
        <div
          className="relative h-full w-full overflow-hidden"
          id={TABLE_CONTENT_ELEMENT_ID}
        >
          {currentView?.type === ViewTypeEnum.Grid && (
            <GridView
              tableName={tableName!}
              databaseName={space}
              view={currentView}
              isEmbed={isEmbed}
            />
          )}
          {currentView?.type === ViewTypeEnum.Gallery && (
            <GalleryView
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
          <FieldEditor
            tableName={tableName}
            databaseName={space}
            view={currentView}
          />
        </div>
      </div>
    </TableContext.Provider>
  )
}
