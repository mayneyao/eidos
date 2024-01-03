import { useCallback, useEffect } from "react"
import { PlusIcon } from "lucide-react"
import {
  createSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom"

import { useTable } from "@/hooks/use-table"

import { Button } from "../ui/button"
import { useCurrentView, useViewOperation } from "./hooks"
import { ViewItem } from "./view-item"

export const ViewToolbar = (props: {
  tableName: string
  space: string
  isEmbed: boolean
}) => {
  const { tableName, space, isEmbed } = props
  const { updateViews, views } = useTable(tableName!, space)
  const navigate = useNavigate()
  const location = useLocation()
  const { addView, delView } = useViewOperation()
  const { currentView, setCurrentViewId, defaultViewId } = useCurrentView()
  const [searchParams] = useSearchParams()
  const sharePeerId = searchParams.get("peerId")

  const jump2View = useCallback(
    (viewId: string) => {
      if (isEmbed) {
        // when embed, we don't need to change the url
        setCurrentViewId(viewId)
        return
      }
      navigate({
        pathname: location.pathname,
        search: sharePeerId
          ? `?${createSearchParams({
              v: viewId,
              peerId: sharePeerId,
            })}`
          : `?${createSearchParams({
              v: viewId,
            })}`,
      })
    },
    [isEmbed, location.pathname, navigate, setCurrentViewId, sharePeerId]
  )

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

  const onlyOneView = views.length === 1
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        {views.map((view) => {
          const isActive = view.id === currentView?.id
          return (
            <ViewItem
              key={view.id}
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
      <div>{/* <Button size="sm">New</Button> */}</div>
    </div>
  )
}
