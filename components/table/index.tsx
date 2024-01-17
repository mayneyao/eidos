import { ViewTypeEnum } from "@/lib/store/IView"
import { useSqliteTableSubscribe } from "@/hooks/use-sqlite-table-subscribe"

import GridView from "../grid"
import { useCurrentView } from "./hooks"
import { ViewToolbar } from "./view-toolbar"
import GalleryView from "./views/gallery"

// const GalleryView = React.lazy(() => import("./views/gallery"))

interface ITableProps {
  space: string
  tableName: string
  viewId?: string
  isEmbed?: boolean
}

export const Table = ({ tableName, space, viewId, isEmbed }: ITableProps) => {
  const { currentView } = useCurrentView()
  useSqliteTableSubscribe(tableName)
  return (
    <div className="h-full w-full overflow-hidden p-2">
      <ViewToolbar
        tableName={tableName}
        space={space}
        isEmbed={Boolean(isEmbed)}
      />
      {currentView?.type === ViewTypeEnum.Grid && (
        <GridView
          tableName={tableName!}
          databaseName={space}
          view={currentView}
        />
      )}
      {currentView?.type === ViewTypeEnum.Gallery && (
        <GalleryView space={space} tableName={tableName} view={currentView} />
      )}
    </div>
  )
}
