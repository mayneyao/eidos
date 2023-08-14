import { useCallback, useEffect } from "react"
import { PlusIcon } from "lucide-react"
import { createSearchParams, useLocation, useNavigate } from "react-router-dom"

import { useTable } from "@/hooks/use-table"

import Grid from "../grid"
import { Button } from "../ui/button"
import { useCurrentView, useView } from "./hooks"
import { ViewItem } from "./view-item"

interface ITableProps {
  space: string
  tableName: string
  viewId?: string
  isEmbed?: boolean
}

export const Table = ({ tableName, space, viewId, isEmbed }: ITableProps) => {
  const { updateViews, views } = useTable(tableName!, space)
  const navigate = useNavigate()
  const location = useLocation()
  const { currentView, setCurrentViewId, defaultViewId } = useCurrentView()

  const onlyOneView = views.length === 1
  const jump2View = useCallback(
    (viewId: string) => {
      if (isEmbed) {
        // when embed, we don't need to change the url
        setCurrentViewId(viewId)
        return
      }
      navigate({
        pathname: location.pathname,
        search: `?${createSearchParams({
          v: viewId,
        })}`,
      })
    },
    [isEmbed, location.pathname, navigate, setCurrentViewId]
  )

  const { addView, delView } = useView()
  const handleAddView = useCallback(async () => {
    const view = await addView()
    if (view) {
      jump2View(view.id)
    }
  }, [addView, jump2View])

  useEffect(() => {
    updateViews()
  }, [updateViews, tableName])

  const deleteView = (viewId: string) => async () => {
    await delView(viewId)
    jump2View(defaultViewId)
  }

  return (
    <div className="relative h-full w-full overflow-hidden p-2">
      <div className="flex items-center ">
        {views.map((view) => {
          const isActive = view.id === currentView?.id
          return (
            <ViewItem
              view={view}
              isActive={isActive}
              jump2View={jump2View}
              deleteView={deleteView(view.id)}
              disabledDelete={onlyOneView}
            />
          )
        })}
        <Button onClick={handleAddView} variant="ghost" size="sm">
          <PlusIcon />
        </Button>
      </div>
      {currentView?.type === "grid" && (
        <Grid tableName={tableName!} databaseName={space} />
      )}
      {currentView?.type === "gallery" && <div>gallery</div>}
    </div>
  )
}
