import { useCallback, useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"
import {
  createSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom"

import { getTableIdByRawTableName, shortenId } from "@/lib/utils"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTableOperation } from "@/hooks/use-table"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { NodeComponent } from "@/app/[database]/[node]/page"

import { Button } from "../ui/button"
import { useCurrentView, useViewOperation } from "./hooks"
import { ViewFilter } from "./view-filter"
import { ViewItem } from "./view-item"
import { ViewSort } from "./view-sort"

export const ViewToolbar = (props: {
  tableName: string
  space: string
  isEmbed: boolean
}) => {
  const { tableName, space, isEmbed } = props
  const { updateViews, views } = useTableOperation(tableName!, space)
  const navigate = useNavigate()
  const location = useLocation()
  const { addView, delView } = useViewOperation()
  const { currentView, setCurrentViewId, defaultViewId } = useCurrentView()
  const [searchParams] = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { addRow } = useTableOperation(tableName, space)
  const { getOrCreateTableSubDoc } = useSqlite()
  const [open, setOpen] = useState(false)
  const tableId = getTableIdByRawTableName(tableName)
  const { subPageId, setSubPage, clearSubPage } = useCurrentSubPage()

  const handleAddRow = async () => {
    const uuid = await addRow()
    if (uuid) {
      const shortId = shortenId(uuid)
      await getOrCreateTableSubDoc({
        docId: shortId,
        title: "",
        tableId: tableId,
      })
      setSubPage(shortId)
    }
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      clearSubPage()
    }
    setOpen(open)
  }

  useEffect(() => {
    if (subPageId) {
      setOpen(true)
    }
  }, [subPageId])

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
    <div>
      <div className="ml-2 flex items-center justify-between border-b pb-1">
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
            <PlusIcon className="h-4 w-4"></PlusIcon>
          </Button>
        </div>
        <div className="flex gap-2">
          <ViewFilter view={currentView!} />
          <ViewSort view={currentView!} />
          <Button size="sm" onClick={handleAddRow}>
            <PlusIcon className="h-4 w-4"></PlusIcon>
            New
          </Button>
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger>
              <div></div>
            </DialogTrigger>
            <DialogContent className="h-[95vh] min-w-[756px] p-0">
              <ScrollArea className="h-full">
                <NodeComponent nodeId={subPageId} />
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
