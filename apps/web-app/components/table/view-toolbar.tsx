import {
  ViewTypeEnum,
  type IView,
  type ViewType,
} from "@/packages/core/types/IView"
import { useKeyPress } from "ahooks"
import { ChevronDownIcon, PlusIcon } from "lucide-react"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { useTranslation } from "react-i18next"
import {
  createSearchParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom"

import { useCurrentSubPage } from "@/apps/web-app/hooks/use-current-sub-page"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { NodeComponent } from "@/apps/web-app/pages/[database]/[node]/page"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/eui/sub-page-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, getTableIdByRawTableName, shortenId, uuidv7 } from "@/lib/utils"

import { Button } from "../ui/button"
import { TABLE_CONTENT_ELEMENT_ID } from "./helper"
import { TableContext, useCurrentView, useViewOperation } from "./hooks"
import { useCustomTableViews } from "./hooks/use-custom-table-views"
import { useTableSearchStore } from "./hooks/use-table-search-store"
import { useViewCount } from "./hooks/use-view-count"
import { SortableContainer } from "./sortable"
import { ViewEditor } from "./view-editor/view-editor"
import { ViewField } from "./view-field/view-field"
import { ViewFilter } from "./view-filter"
import { ViewIcon } from "./view-icon"
import { ViewItem } from "./view-item"
import { ViewRawQuery } from "./view-raw-query"
import { ViewSearch } from "./view-search"
import { ViewSort } from "./view-sort"

const Views = ({
  views,
  currentView,
  jump2View,
  deleteView,
  asList,
  onReorder,
  onAddView,
  isView,
  isReadOnly,
  onEditStart,
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
  onAddView: (viewType: ViewType) => void
  isView: boolean
  isReadOnly?: boolean
  onEditStart: (viewId: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const [localViews, setLocalViews] = useState(views)

  // Update local state when external views change
  useEffect(() => {
    setLocalViews(views)
  }, [views])


  const handleReorder = useCallback(
    (newViews: IView[]) => {
      setLocalViews(newViews)
      
      // Call external callback asynchronously to avoid blocking UI updates
      setTimeout(() => {
        // Find the moved view by comparing with original order
        const originalOrder = views.map(v => v.id)
        const newOrder = newViews.map(v => v.id)
        
        // Find which view moved and where
        for (let i = 0; i < newOrder.length; i++) {
          if (originalOrder[i] !== newOrder[i]) {
            const movedViewId = newOrder[i]
            const targetViewId = i > 0 ? newOrder[i - 1] : newOrder[i + 1]
            const direction = i > originalOrder.indexOf(movedViewId) ? "down" : "up"
            onReorder?.(movedViewId, targetViewId, direction)
            break
          }
        }
      }, 0)
    },
    [onReorder, views]
  )

  // Add drag state management for visual feedback
  const [isDragging, setIsDragging] = useState(false)

  const onlyOneView = views.length === 1
  const { t } = useTranslation()
  const { tableViews } = useCustomTableViews()

  // Handle view switching and close dropdown
  const handleJump2View = (viewId: string) => {
    jump2View(viewId)
    setOpen(false)
  }

  // Handle adding new view and close dropdown
  const handleAddView = (viewType: ViewType) => {
    onAddView(viewType)
    setOpen(false)
  }

  // Always render as dropdown now
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="flex items-center gap-2 px-1"
        >
          {currentView && (
            <>
              <ViewIcon
                viewType={currentView.type}
                className="h-4 w-4"
                showCursor={false}
              />
              <span className="select-none">{currentView.name}</span>
            </>
          )}
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <SortableContainer
          items={localViews}
          onReorder={handleReorder}
          className="space-y-1 overflow-hidden"
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
          renderItem={(view, index) => {
            const isActive = view.id === currentView?.id
            return (
              <ViewItem
                key={view.id}
                view={view}
                isActive={isActive}
                jump2View={handleJump2View}
                deleteView={async () => {
                  await deleteView(view.id)()
                  setOpen(false)
                }}
                disabledDelete={onlyOneView}
                isInDropdown={true}
                isReadOnly={isReadOnly}
                onEditStart={() => onEditStart(view.id)}
                isDragging={isDragging}
              />
            )
          }}
        />

        {!isReadOnly && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <div className="flex items-center gap-2">
                  <PlusIcon className="h-4 w-4" />
                  <span>{t("table.view.createNew")}</span>
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => handleAddView(ViewTypeEnum.Grid)}
                >
                  <div className="flex items-center gap-2">
                    <ViewIcon viewType="grid" className="h-4 w-4" />
                    <span>{t("views.types.grid")}</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAddView(ViewTypeEnum.Gallery)}
                >
                  <div className="flex items-center gap-2">
                    <ViewIcon viewType="gallery" className="h-4 w-4" />
                    <span>{t("views.types.gallery")}</span>
                  </div>
                </DropdownMenuItem>
                {!isView && (
                  <DropdownMenuItem
                    onClick={() => handleAddView(ViewTypeEnum.Kanban)}
                  >
                    <div className="flex items-center gap-2">
                      <ViewIcon viewType="kanban" className="h-4 w-4" />
                      <span>{t("views.types.kanban")}</span>
                    </div>
                  </DropdownMenuItem>
                )}
                {tableViews.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {tableViews.map((view) => (
                      <DropdownMenuItem
                        key={view.id}
                        onClick={() =>
                          handleAddView(`ext__${view.meta?.tableView?.type}`)
                        }
                      >
                        <div className="flex items-center gap-2">
                          <ViewIcon
                            viewType={`ext__${view.meta?.tableView?.type}`}
                            className="h-4 w-4"
                          />
                          <span>{view.meta?.tableView?.title}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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

  const isView = tableName.startsWith("vw_")
  const { currentView, setCurrentViewId, defaultViewId } = useCurrentView({
    space,
    tableName,
    viewId,
  })
  const { count: currentViewCount } = useViewCount(currentView)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { addRow } = useTableOperation(tableName, space)
  const { getOrCreateTableSubDoc, sqlite } = useSqlite()
  const [open, setOpen] = useState(false)
  const tableId = getTableIdByRawTableName(tableName)
  const { subPageId, setSubPage, clearSubPage } = useCurrentSubPage()
  const { t } = useTranslation()

  // Use context instead
  const { searchQuery, setSearchQuery, showSearch, setShowSearch } =
    useTableSearchStore()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus when search box is shown
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus()
    }
  }, [showSearch])

  // Update search related handlers to use context
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        searchQuery === ""
      ) {
        setShowSearch(false)
      }
    },
    [searchQuery, setShowSearch]
  )

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [handleClickOutside])

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

  const handleAddView = useCallback(
    async (viewType: ViewType) => {
      const view = await addView(viewType)
      if (view) {
        jump2View(view.id)
      }
    },
    [addView, jump2View]
  )

  useEffect(() => {
    updateViews()
  }, [updateViews, tableName])

  const deleteView = (viewId: string) => async () => {
    await delView(viewId)
    // 删除后获取更新后的视图列表，切换到第一个视图
    await updateViews()
    const updatedViews = await sqlite?.view.list(
      { table_id: tableId },
      {
        order: "ASC",
        orderBy: "position",
      }
    )
    if (updatedViews && updatedViews.length > 0) {
      jump2View(updatedViews[0].id)
    }
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

  useKeyPress("esc", () => {
    if (showSearch) {
      setShowSearch(false)
      setSearchQuery("")
    }
  })

  useKeyPress(["ctrl.f", "meta.f"], (event) => {
    event.preventDefault()
    setShowSearch(true)
  })

  return (
    <div ref={ref}>
      <div className="ml-2 flex items-center justify-between border-b pb-1">
        <div className="flex items-center min-w-0" ref={ref1}>
          <div className="flex items-center min-w-0">
            <Views
              views={views}
              currentView={currentView}
              jump2View={jump2View}
              deleteView={deleteView}
              onReorder={handleReorderViews}
              onAddView={handleAddView}
              isView={isView}
              isReadOnly={props.isReadOnly}
              onEditStart={setEditingViewId}
            />
            {currentView && (
              <span className="text-xs text-muted-foreground ml-2 select-none flex-shrink-0">
                ({currentViewCount})
              </span>
            )}
          </div>
        </div>
        <div
          className={cn("flex gap-2 hover:opacity-100", {
            // "opacity-0": isEmbed,
          })}
          ref={ref2}
        >
          <div className="flex gap-1">
            {!isView && <ViewSearch view={currentView} />}
            <ViewFilter view={currentView} />
            <ViewSort view={currentView} />
            <ViewField view={currentView} />
            {isView && <ViewRawQuery />}
          </div>

          {!props.isReadOnly && !isView && (
            <Button size="xs" onClick={handleAddRow} variant="ghost">
              <PlusIcon className="h-4 w-4"></PlusIcon>
              {/* {t("common.new")} */}
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
              <div className="h-full w-full overflow-x-hidden">
                <NodeComponent nodeId={subPageId} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {editingViewId &&
        ReactDOM.createPortal(
          <div
            onClick={(e) => {
              if ((e.target as Element).closest("#view-editor")) {
                return
              }
              setEditingViewId(null)
            }}
            className="absolute inset-0 z-10"
          >
            <ViewEditor
              setEditDialogOpen={(open) => setEditingViewId(null)}
              view={views.find((v) => v.id === editingViewId)!}
            />
          </div>,
          document.getElementById(TABLE_CONTENT_ELEMENT_ID)!
        )}
    </div>
  )
}
