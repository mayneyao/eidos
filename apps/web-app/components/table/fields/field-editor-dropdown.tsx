import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { FieldType } from "@/packages/core/fields/const"
import type { IGridViewProperties, IView } from "@/packages/core/types/IView"
import {
  ColumnStatType,
  STAT_CATEGORIES,
  getStatTypeSymbol,
  getSupportedStats,
  type ColumnStatConfig,
} from "@/packages/core/types/IColumnStats"
import {
  ArrowDownWideNarrowIcon,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpNarrowWideIcon,
  Check,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  Settings2,
  Trash2,
  SigmaIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLayer } from "react-laag"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { CommonMenuItem } from "@/components/common-menu-item"
import {
  TableContext,
  useCurrentView,
  useViewOperation,
} from "@/components/table/hooks"
import { useTableFields } from "@/apps/web-app/hooks/use-table"

import { useColumns } from "../views/grid/hooks/use-col"
import { useTableStore } from "../table-store-provider"
import { FieldNameEdit } from "./field-name-edit"

// Submenu item
interface ISubMenuItem {
  icon?: React.ComponentType<{ className?: string }> | string
  label: string
  onClick: () => void
  checked?: boolean
}

// Submenu group
interface ISubMenuGroup {
  title?: string
  items: ISubMenuItem[]
}

interface IMenuItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: (e?: any) => void
  variant?: "destructive"
  dialogTrigger?: boolean
  // Secondary menu support
  hasSubmenu?: boolean
  submenuGroups?: ISubMenuGroup[]
  submenuOpen?: boolean
  onSubmenuToggle?: () => void
}

interface IFieldEditorDropdownProps {
  tableName: string
  databaseName: string
  view: IView
  deleteField: (fieldId: string) => void
}

export const FieldEditorDropdown = (props: IFieldEditorDropdownProps) => {
  const { deleteField, tableName, databaseName } = props
  const {
    menu,
    setMenu,
    setIsFieldPropertiesEditorOpen,
    setIsAddFieldEditorOpen,
    currentUiColumn,
    setCurrentUiColumn,
    setFieldInsertPosition,
  } = useTableStore()

  const { isView } = useContext(TableContext)
  const isOpen = menu !== undefined
  const ref = useRef<HTMLDivElement | null>(null)
  const ref2 = useRef<HTMLDivElement | null>(null)

  // Clear submenu state when parent menu closes
  useEffect(() => {
    if (!isOpen) {
      setActiveSubmenu(null)
    }
  }, [isOpen])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [currentColIndex, setCurrentColIndex] = useState<number>()
  const { currentView } = useCurrentView<IGridViewProperties>()
  const { addSort, freezeColumn, updateView } = useViewOperation()
  const inputRef = useRef<HTMLInputElement>(null)
  const { fields } = useTableFields(tableName)
  const { showColumns } = useColumns(fields, props.view)
  const { t } = useTranslation()

  useEffect(() => {
    if (menu) {
      setCurrentColIndex(menu.col)
      const currentField = showColumns[menu.col]
      setCurrentUiColumn(currentField)
      inputRef.current?.focus()
      // Delay one frame to trigger animation, ensure useLayer position calculation completes
      requestAnimationFrame(() => setIsAnimating(true))
    } else {
      setIsAnimating(false)
    }
  }, [menu, showColumns, setCurrentUiColumn])

  const { layerProps, renderLayer } = useLayer({
    isOpen,
    auto: true,
    placement: "bottom-start",
    trigger: {
      getBounds: () => {
        const res = {
          left: menu?.bounds.x ?? 0,
          top: menu?.bounds.y ?? 0,
          width: menu?.bounds.width ?? 0,
          height: menu?.bounds.height ?? 0,
          right: (menu?.bounds.x ?? 0) + (menu?.bounds.width ?? 0),
          bottom: (menu?.bounds.y ?? 0) + (menu?.bounds.height ?? 0),
        }
        return res
      },
    },
  })

  const handleEditFieldPropertiesClick = (e: any) => {
    e.stopPropagation()
    setIsFieldPropertiesEditorOpen(true)
    setMenu(undefined)
  }

  const handleDeleteFieldClick = () => {
    setCurrentColIndex(menu?.col)
    setMenu(undefined)
  }

  const deleteFieldByColIndex = (colIndex: number) => {
    const fieldId = showColumns[colIndex].table_column_name
    deleteField(fieldId)
  }

  const handleDeleteFieldConfirm = () => {
    if (currentColIndex != null) {
      deleteFieldByColIndex(currentColIndex)
    }
    setIsDeleteDialogOpen(false)
    setCurrentColIndex(undefined)
  }

  const addASCSort = () => {
    if (currentUiColumn) {
      addSort(currentView!, currentUiColumn.table_column_name, "ASC")
    }
    setMenu(undefined)
  }

  const addDESCSort = () => {
    if (currentUiColumn) {
      addSort(currentView!, currentUiColumn.table_column_name, "DESC")
    }
    setMenu(undefined)
  }

  const showResetFreezeColumn = useMemo(() => {
    return (
      (currentView?.properties?.freezeColumns ?? 0) ===
      (currentColIndex ?? 0) + 1
    )
  }, [currentView?.properties?.freezeColumns, currentColIndex])

  const handleFreezeColumn = () => {
    const colIndex = showColumns.findIndex(
      (col) => col.table_column_name === currentUiColumn?.table_column_name
    )
    if (colIndex !== -1) {
      if (showResetFreezeColumn) {
        freezeColumn(currentView!.id, 0)
      } else {
        freezeColumn(currentView!.id, colIndex + 1)
      }
    }
    setMenu(undefined)
  }

  const handleAddFieldLeft = () => {
    if (currentUiColumn && currentView && menu) {
      const currentPosition = menu.col
      setFieldInsertPosition(currentPosition)
      setIsAddFieldEditorOpen(true)
      setMenu(undefined)
    }
  }

  const handleAddFieldRight = () => {
    if (currentUiColumn && currentView && menu) {
      const currentPosition = menu.col
      setFieldInsertPosition(currentPosition + 1)
      setIsAddFieldEditorOpen(true)
      setMenu(undefined)
    }
  }

  // Get supported stat types for current column
  const supportedStats = useMemo(() => {
    if (!currentUiColumn) return []
    return getSupportedStats(currentUiColumn.type)
  }, [currentUiColumn])

  // Get current column's stat config
  const currentStatConfig = useMemo(() => {
    if (!currentUiColumn || !currentView?.properties?.columnStats) return null
    return currentView.properties.columnStats[currentUiColumn.table_column_name]
  }, [currentUiColumn, currentView?.properties?.columnStats])

  // Update column stat config
  const handleUpdateColumnStat = useCallback(
    (type: ColumnStatType | null) => {
      if (!currentUiColumn || !currentView) return

      const colName = currentUiColumn.table_column_name
      const currentConfig = currentView.properties?.columnStats || {}

      let newStats: Record<string, ColumnStatConfig>
      if (type === null) {
        // Delete config
        const { [colName]: _, ...rest } = currentConfig
        newStats = rest
      } else {
        // Update or add config
        newStats = {
          ...currentConfig,
          [colName]: {
            type,
            precision:
              type === ColumnStatType.PercentEmpty ||
              type === ColumnStatType.PercentNotEmpty
                ? 1
                : type === ColumnStatType.Avg
                  ? 1
                  : 0,
          },
        }
      }

      updateView(currentView.id, {
        properties: {
          ...currentView.properties,
          columnStats: newStats,
        },
      })
    },
    [currentUiColumn, currentView, updateView]
  )

  // Submenu state
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const submenuTriggerRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{
    top: number
    left: number
  } | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (e: Event) => {
      // Ignore clicks on elements that should be ignored
      const ignoreElements = document.querySelectorAll(".click-outside-ignore")
      if (
        Array.from(ignoreElements).some((node) =>
          node.contains(e.target as Node)
        )
      ) {
        return
      }

      // Check if click is inside current menu or submenu
      if (
        ref2.current?.contains(e.target as Node) ||
        submenuRef.current?.contains(e.target as Node)
      ) {
        return
      }

      setMenu(undefined)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(undefined)
      }
    }

    // Use capture phase to ensure we catch the event before it's stopped by stopPropagation
    document.addEventListener("mousedown", handleOutsideClick, true)
    document.addEventListener("touchstart", handleOutsideClick, true)
    document.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true)
      document.removeEventListener("touchstart", handleOutsideClick, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isOpen, setMenu])

  // Safe triangle: track mouse position and close intent
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if mouse is moving toward the submenu (safe triangle)
  const isMovingTowardSubmenu = useCallback(() => {
    if (!submenuRef.current || !submenuTriggerRef.current) return false
    const submenuRect = submenuRef.current.getBoundingClientRect()
    const triggerRect = submenuTriggerRef.current.getBoundingClientRect()
    const { x, y } = mousePos.current

    // The submenu is to the right of the trigger
    const isRight = submenuRect.left >= triggerRect.left

    if (isRight) {
      // Safe zone: triangle from mouse position to top-right and bottom-right of trigger
      // If mouse is between the trigger right edge and the submenu, it's in the safe zone
      if (x >= triggerRect.left && x <= submenuRect.right) {
        // Check if mouse Y is within a generous band from trigger top to submenu bottom (or vice versa)
        const safeTop = Math.min(triggerRect.top, submenuRect.top) - 20
        const safeBottom = Math.max(triggerRect.bottom, submenuRect.bottom) + 20
        if (y >= safeTop && y <= safeBottom) {
          return true
        }
      }
    } else {
      // Submenu is to the left
      if (x <= triggerRect.right && x >= submenuRect.left) {
        const safeTop = Math.min(triggerRect.top, submenuRect.top) - 20
        const safeBottom = Math.max(triggerRect.bottom, submenuRect.bottom) + 20
        if (y >= safeTop && y <= safeBottom) {
          return true
        }
      }
    }

    return false
  }, [])

  // Schedule closing the submenu with safe-triangle check
  const scheduleCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = setTimeout(() => {
      // Re-check: if mouse is heading toward submenu, don't close
      if (isMovingTowardSubmenu()) {
        // Re-schedule another check
        scheduleCloseSubmenu()
        return
      }
      setActiveSubmenu(null)
    }, 200)
  }, [isMovingTowardSubmenu])

  // Cancel scheduled close (when mouse enters submenu or trigger)
  const cancelCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  // Track mouse position within the main menu container
  const handleMenuMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY }
  }, [])

  // Calculate submenu position with boundary detection
  const calculateSubmenuPosition = useCallback((triggerRect: DOMRect) => {
    const submenuWidth = 180 // min-w-[180px]
    const submenuHeight = 250 // estimated max height
    const gap = 4
    const padding = 8

    let left = triggerRect.right + gap
    let top = triggerRect.top - 4

    // Check right boundary
    if (left + submenuWidth > window.innerWidth - padding) {
      left = triggerRect.left - submenuWidth - gap
    }

    // Check bottom boundary
    if (top + submenuHeight > window.innerHeight - padding) {
      top = window.innerHeight - submenuHeight - padding
    }

    // Check top boundary
    if (top < padding) {
      top = padding
    }

    return { top, left }
  }, [])

  // Update submenu position on window resize/scroll when active
  useEffect(() => {
    if (activeSubmenu !== "stats" || !submenuTriggerRef.current) return

    const updatePosition = () => {
      const rect = submenuTriggerRef.current!.getBoundingClientRect()
      setSubmenuPos(calculateSubmenuPosition(rect))
    }

    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [activeSubmenu, calculateSubmenuPosition])

  // Build stat menu group structure based on config (STAT_CATEGORIES)
  const statSubmenuGroups = useMemo(() => {
    const supported = new Set(supportedStats)

    const groups: ISubMenuGroup[] = [
      {
        items: [
          {
            label: t("table.columnStats.none"),
            onClick: () => handleUpdateColumnStat(null),
            checked: !currentStatConfig,
          },
        ],
      },
    ]

    // Build groups based on STAT_CATEGORIES config
    Object.entries(STAT_CATEGORIES).forEach(([categoryKey, category]) => {
      // Filter types that are supported by this field
      const items: ISubMenuItem[] = category.types
        .filter((type) => supported.has(type))
        .map((type) => ({
          icon: getStatTypeSymbol(type),
          label: t(`table.columnStats.${type}`),
          onClick: () => handleUpdateColumnStat(type),
          checked: currentStatConfig?.type === type,
        }))

      if (items.length > 0) {
        groups.push({
          title: t(`table.columnStats.${categoryKey}`),
          items,
        })
      }
    })

    return groups
  }, [supportedStats, currentStatConfig, t, handleUpdateColumnStat])

  const menuGroups: { id: string; items: IMenuItem[] }[] = [
    {
      id: "edit",
      items: [
        {
          icon: Settings2,
          label: t("table.editProperty"),
          onClick: handleEditFieldPropertiesClick,
        },
      ],
    },
    // Stat config - submenu (grouped by Count/Percent/More options)
    ...(supportedStats.length > 0
      ? [
          {
            id: "stats" as const,
            items: [
              {
                icon: SigmaIcon,
                label: t("table.columnStats"),
                hasSubmenu: true,
              },
            ],
          },
        ]
      : []),
    {
      id: "sort",
      items: [
        {
          icon: ArrowUpNarrowWideIcon,
          label: t("table.sortAscending"),
          onClick: addASCSort,
        },
        {
          icon: ArrowDownWideNarrowIcon,
          label: t("table.sortDescending"),
          onClick: addDESCSort,
        },
      ],
    },
    {
      id: "insert",
      items: !isView
        ? [
            {
              icon: ChevronLeftIcon,
              label: t("table.insertLeft"),
              onClick: handleAddFieldLeft,
            },
            {
              icon: ChevronRightIcon,
              label: t("table.insertRight"),
              onClick: handleAddFieldRight,
            },
          ]
        : [],
    },
    {
      id: "freeze",
      items: [
        {
          icon: showResetFreezeColumn ? ArrowLeftToLine : ArrowRightToLine,
          label: showResetFreezeColumn
            ? t("table.resetFreezeColumn")
            : t("table.freezeToHere"),
          onClick: handleFreezeColumn,
        },
      ],
    },
    {
      id: "delete",
      items:
        currentUiColumn?.type !== "title" && !isView
          ? [
              {
                icon: Trash2,
                label: t("table.deleteField"),
                onClick: handleDeleteFieldClick,
                variant: "destructive" as const,
                dialogTrigger: true,
              },
            ]
          : [],
    },
  ]

  return (
    <div>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        {renderLayer(
          <div
            {...layerProps}
            className={cn(
              "hidden min-w-[200px] overflow-hidden rounded-lg bg-popover p-1 shadow-xl border",
              isOpen && "block",
              // Keep transparent before animation starts to avoid flickering
              isOpen && !isAnimating && "opacity-0",
              isAnimating &&
                "animate-in fade-in zoom-in-95 duration-100 origin-top-left"
            )}
            onMouseMoveCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            ref={(node) => {
              layerProps.ref(node)
              ref2.current = node
            }}
          >
            <div>
              {/* Field Name Edit Section */}
              <div className="px-2 py-1.5 mb-0.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t("table.field.fieldName")}
                  </span>
                </div>
                {currentUiColumn && (
                  <FieldNameEdit
                    field={currentUiColumn}
                    tableName={tableName}
                    databaseName={databaseName}
                    onEditEnd={() => setMenu(undefined)}
                  />
                )}
              </div>

              <Separator className="my-1" />

              {/* Menu Groups */}
              <div className="relative" onMouseMove={handleMenuMouseMove}>
                {menuGroups.map((group, groupIndex) =>
                  group.items.length > 0 ? (
                    <div key={group.id}>
                      {groupIndex > 0 && <Separator className="my-1" />}
                      <div className="space-y-0">
                        {group.items.map((item, itemIndex) => {
                          // Item with submenu (stat config)
                          if (item.hasSubmenu && group.id === "stats") {
                            const handleMouseEnter = () => {
                              cancelCloseSubmenu()
                              setActiveSubmenu(group.id)
                              // Calculate submenu position with boundary detection
                              if (submenuTriggerRef.current) {
                                const rect =
                                  submenuTriggerRef.current.getBoundingClientRect()
                                setSubmenuPos(calculateSubmenuPosition(rect))
                              }
                            }

                            return (
                              <div
                                key={`${group.id}-${itemIndex}`}
                                ref={submenuTriggerRef}
                                onMouseEnter={handleMouseEnter}
                              >
                                <CommonMenuItem
                                  className={cn(
                                    "pl-2 py-1 justify-between",
                                    activeSubmenu === group.id && "bg-accent/50"
                                  )}
                                >
                                  <div className="flex items-center">
                                    <item.icon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="text-xs">
                                      {item.label}
                                    </span>
                                  </div>
                                  <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />
                                </CommonMenuItem>
                              </div>
                            )
                          }

                          // Normal menu item
                          const content = (
                            <CommonMenuItem
                              className={cn(
                                "pl-2 py-1",
                                item.variant === "destructive" &&
                                  "text-destructive hover:text-destructive hover:bg-destructive/10"
                              )}
                              onClick={
                                item.dialogTrigger ? undefined : item.onClick
                              }
                              onMouseEnter={() => {
                                if (activeSubmenu) {
                                  // Don't close immediately; schedule with safe-triangle check
                                  scheduleCloseSubmenu()
                                }
                              }}
                            >
                              <item.icon
                                className={cn(
                                  "mr-2 h-3.5 w-3.5 shrink-0",
                                  item.variant === "destructive"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                )}
                              />
                              <span className="text-xs">{item.label}</span>
                            </CommonMenuItem>
                          )

                          return item.dialogTrigger ? (
                            <DialogTrigger
                              key={`${group.id}-${itemIndex}`}
                              onClick={item.onClick}
                              className="w-full"
                            >
                              {content}
                            </DialogTrigger>
                          ) : (
                            <div key={`${group.id}-${itemIndex}`}>
                              {content}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null
                )}
              </div>

              {/* Delete Confirmation Dialog */}
              <DialogContent className="max-w-[300px]">
                <DialogHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-destructive/10">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </div>
                    <DialogTitle className="text-sm">
                      {t("table.deleteFieldConfirmation")}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-xs leading-relaxed">
                    {currentUiColumn?.type === FieldType.Link
                      ? t("table.deleteLinkFieldWarning")
                      : t("common.thisActionCannotBeUndone")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-1.5 sm:gap-1.5 mt-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteDialogOpen(false)}
                    className="h-7 text-xs"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteFieldConfirm}
                    className="h-7 text-xs"
                  >
                    {t("common.delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </div>
          </div>
        )}
      </Dialog>

      {/* Stat submenu Portal */}
      {activeSubmenu === "stats" &&
        submenuPos &&
        createPortal(
          <div
            ref={submenuRef}
            className="fixed min-w-[180px] rounded-lg bg-popover p-1 shadow-xl border z-[9999]"
            style={{ top: submenuPos.top, left: submenuPos.left }}
            onMouseEnter={() => {
              cancelCloseSubmenu()
              setActiveSubmenu("stats")
            }}
            onMouseLeave={() => setActiveSubmenu(null)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {statSubmenuGroups.map((subGroup, sgIndex) => (
              <div key={sgIndex}>
                {subGroup.title && (
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {subGroup.title}
                  </div>
                )}
                {subGroup.items.map((subItem, siIndex) => (
                  <CommonMenuItem
                    key={`${sgIndex}-${siIndex}`}
                    className={cn(
                      "pl-2 py-1",
                      subItem.checked && "bg-accent/50"
                    )}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      e.preventDefault()
                      subItem.onClick()
                      setActiveSubmenu(null)
                      setMenu(undefined)
                    }}
                  >
                    {typeof subItem.icon === "string" ? (
                      <span className="text-muted-foreground/60 w-4 text-center mr-1 text-[10px]">
                        {subItem.icon}
                      </span>
                    ) : (
                      <span className="w-4 text-center mr-1"> </span>
                    )}
                    <span className="text-xs">{subItem.label}</span>
                    {subItem.checked && <Check className="h-3 w-3 ml-auto" />}
                  </CommonMenuItem>
                ))}
                {sgIndex < statSubmenuGroups.length - 1 && (
                  <Separator className="my-1" />
                )}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
