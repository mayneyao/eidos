import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { ChevronDownIcon, PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  createSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom"

import { IView } from "@/lib/store/IView"
import { cn, getTableIdByRawTableName, shortenId, uuidv7 } from "@/lib/utils"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTableOperation } from "@/hooks/use-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/sub-page-dialog"
import { NodeComponent } from "@/apps/web-app/[database]/[node]/page"

import { Button } from "../ui/button"
import { TableContext, useCurrentView, useViewOperation } from "./hooks"
import { ViewField } from "./view-field/view-field"
import { ViewFilter } from "./view-filter"
import { ViewItem } from "./view-item"
import { ViewSort } from "./view-sort"

const Views = ({
  views,
  currentView,
  jump2View,
  deleteView,
  asList,
  onReorder,
}: {
  views: IView[]
  currentView: IView | undefined
  jump2View: (viewId: string) => void
  deleteView: (viewId: string) => () => void
  asList?: boolean
  onReorder?: (
    dragId: string,
    targetId: string,
    direction: "up" | "down"
  ) => void
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Calculate the direction based on the index difference
    const activeIndex = views.findIndex((view) => view.id === active.id)
    const overIndex = views.findIndex((view) => view.id === over.id)
    const direction = activeIndex > overIndex ? "up" : "down"

    onReorder?.(active.id as string, over.id as string, direction)
  }

  const onlyOneView = views.length === 1
  if (asList) {
    const view = views[0]
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex items-center gap-2">
            {view && <span className="select-none">{view.name}</span>}
            <ChevronDownIcon className="h-4 w-4" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {views.slice(1).map((view) => {
            const isActive = view.id === currentView?.id
            return (
              <DropdownMenuItem key={view.id}>{view.name}</DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={views.map((v) => v.id)}
        strategy={horizontalListSortingStrategy}
      >
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
      </SortableContext>
    </DndContext>
  )
}
export const ViewToolbar = (props: {
  tableName: string
  space: string
  isEmbed: boolean
  isReadOnly?: boolean
}) => {
  const { space, tableName, viewId } = useContext(TableContext)
  const ref = useRef<HTMLDivElement>(null)
  const ref1 = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  // const size = useSize(ref)

  // const { gap, display, breakpoint } = useGap(
  //   size?.width,
  //   ref1.current,
  //   ref2.current
  // )

  const { isEmbed } = props
  const { updateViews, views } = useTableOperation(tableName!, space)
  const navigate = useNavigate()
  const location = useLocation()
  const { addView, delView, moveViewPosition } = useViewOperation()

  const { currentView, setCurrentViewId, defaultViewId } = useCurrentView({
    space,
    tableName,
    viewId,
  })
  const [searchParams] = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { addRow } = useTableOperation(tableName, space)
  const { getOrCreateTableSubDoc } = useSqlite()
  const [open, setOpen] = useState(false)
  const tableId = getTableIdByRawTableName(tableName)
  const { subPageId, setSubPage, clearSubPage } = useCurrentSubPage()
  const { t } = useTranslation()

  const handleAddRow = async () => {
    const uuid = uuidv7()
    const shortId = shortenId(uuid)
    console.time("getOrCreateTableSubDoc")
    await getOrCreateTableSubDoc({
      docId: shortId,
      title: "",
      tableId: tableId,
    })
    console.timeEnd("getOrCreateTableSubDoc")
    setSubPage(shortId)
    await addRow(uuid)
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

  const handleMaximize = useCallback(() => {
    if (subPageId) {
      navigate(`/${space}/${subPageId}`)
    }
  }, [navigate, space, subPageId])

  const handleReorderViews = useCallback(
    async (dragId: string, targetId: string, direction: "up" | "down") => {
      try {
        await moveViewPosition(dragId, targetId, direction)
        await updateViews()
      } catch (error) {
        console.error("Failed to reorder views:", error)
      }
    },
    [tableName, updateViews]
  )

  return (
    <div ref={ref}>
      <div className="ml-2 flex items-center justify-between border-b pb-1">
        <div className="flex items-center" ref={ref1}>
          <Views
            views={views}
            currentView={currentView}
            jump2View={jump2View}
            deleteView={deleteView}
            onReorder={handleReorderViews}
          />
          {!props.isReadOnly && (
            <Button onClick={handleAddView} variant="ghost" size="sm">
              <PlusIcon className="h-4 w-4"></PlusIcon>
            </Button>
          )}
        </div>
        <div
          className={cn("flex gap-2 hover:opacity-100", {
            "opacity-0": isEmbed,
          })}
          ref={ref2}
        >
          <div className="flex gap-1">
            <ViewFilter view={currentView} />
            <ViewSort view={currentView} />
            <ViewField view={currentView} />
          </div>

          {!props.isReadOnly && (
            <Button size="xs" onClick={handleAddRow}>
              <PlusIcon className="h-4 w-4"></PlusIcon>
              {t("common.new")}
            </Button>
          )}
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger>
              <div></div>
            </DialogTrigger>
            <DialogContent
              className="container h-[95vh] p-0 md:max-w-[756px]"
              onMaximize={handleMaximize}
            >
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
