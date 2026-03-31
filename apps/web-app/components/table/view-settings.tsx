import { useContext, useEffect, useMemo, useState } from "react"
import type { IField } from "@/packages/core/types/IField"
import { ViewTypeEnum, type IView } from "@/packages/core/types/IView"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  LayoutGridIcon,
  SquareKanbanIcon,
  Table2Icon,
  XIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { sortBy } from "@/lib/lodash"

import { TableContext, useTableContext, useViewOperation } from "./hooks"
import { useViewCount } from "./hooks/use-view-count"
import { SortableContainer } from "./sortable"
import { FieldItemCard } from "./view-field/view-field-item"
import { GridViewProperties } from "./views/grid/properties"
import { GalleryViewProperties } from "./views/gallery/properties"
import { KanbanViewProperties } from "./views/kanban/properties"
import { DocListViewProperties } from "./views/doc-list/properties"

const LIMIT_ROWS_FOR_OPTIMIZE_VIEW = 88888

type SettingsPanel = "main" | "layout" | "properties"

// View type option component
const ViewTypeOption = ({
  icon: Icon,
  title,
  isActive,
  onClick,
  disabled,
}: {
  icon: React.FC<{ className?: string }>
  title: string
  isActive: boolean
  onClick: () => void
  disabled?: boolean
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-all duration-150",
        isActive
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-background hover:bg-accent/50 hover:border-accent",
        disabled &&
          "opacity-50 cursor-not-allowed hover:bg-background hover:border-border"
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "text-[11px] font-medium",
          isActive ? "text-primary" : "text-foreground"
        )}
      >
        {title}
      </span>
    </button>
  )
}

// Main menu item component
const MenuItem = ({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.FC<{ className?: string }>
  label: string
  value?: React.ReactNode
  onClick?: () => void
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-2.5 py-2 rounded-md",
        "text-sm text-foreground",
        "hover:bg-accent/60 transition-colors duration-150",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </span>
      {value && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="text-xs">{value}</span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}

// Main settings menu (first level)
const MainMenu = ({
  view,
  onSelectPanel,
}: {
  view: IView
  onSelectPanel: (panel: SettingsPanel) => void
}) => {
  const { t } = useTranslation()
  const { tableName, space } = useContext(TableContext)
  const { uiColumns } = useUiColumns(tableName, space)

  const hiddenFieldsCount = view?.hidden_fields?.length || 0
  const totalFieldsCount = uiColumns.length
  const visibleFieldsCount = totalFieldsCount - hiddenFieldsCount

  return (
    <div className="space-y-0.5">
      <MenuItem
        icon={LayoutGridIcon}
        label={t("table.viewType", "Layout")}
        value={<span className="capitalize">{view?.type}</span>}
        onClick={() => onSelectPanel("layout")}
      />
      <MenuItem
        icon={EyeIcon}
        label={t("table.view.propertyVisibility", "Property visibility")}
        value={visibleFieldsCount}
        onClick={() => onSelectPanel("properties")}
      />
    </div>
  )
}

// Layout settings panel (second level)
const LayoutPanel = ({ view }: { view: IView }) => {
  const { t } = useTranslation()
  const { updateView } = useViewOperation()
  const { count, loading } = useViewCount(view)
  const disabled = loading || count > LIMIT_ROWS_FOR_OPTIMIZE_VIEW
  const [name, setName] = useState(view?.name || "")

  useEffect(() => {
    setName(view?.name || "")
  }, [view?.name])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handleNameBlur = () => {
    if (name !== view?.name) {
      updateView(view.id, { name })
    }
  }

  const handleChangeViewType = (type: ViewTypeEnum) => {
    if (!view || type === view.type) return
    updateView(view.id, { type })
  }

  return (
    <div className="space-y-4">
      {/* Name Field */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("common.name")}
        </Label>
        <Input
          value={name}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          className="h-8 text-sm"
        />
      </div>

      {/* View Type Selection */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground">
          {t("table.viewType")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <ViewTypeOption
            icon={Table2Icon}
            title={t("table.view.grid")}
            isActive={view?.type === "grid"}
            onClick={() => handleChangeViewType(ViewTypeEnum.Grid)}
          />
          <ViewTypeOption
            icon={LayoutGridIcon}
            title={t("table.view.gallery")}
            isActive={view?.type === "gallery"}
            onClick={() => handleChangeViewType(ViewTypeEnum.Gallery)}
            disabled={disabled}
          />
          <ViewTypeOption
            icon={SquareKanbanIcon}
            title={t("table.view.kanban")}
            isActive={view?.type === "kanban"}
            onClick={() => handleChangeViewType(ViewTypeEnum.Kanban)}
            disabled={disabled}
          />
        </div>
        {disabled && (
          <p className="text-xs text-muted-foreground">
            {t("table.view.disabledViewTypesWarning")}
          </p>
        )}
      </div>

      {/* View-specific properties */}
      <div className="space-y-3">
        {view.type === ViewTypeEnum.Gallery && (
          <GalleryViewProperties viewId={view.id} />
        )}
        {view.type === ViewTypeEnum.Grid && <GridViewProperties />}
        {view.type === ViewTypeEnum.DocList && <DocListViewProperties />}
        {view.type === ViewTypeEnum.Kanban && (
          <KanbanViewProperties viewId={view.id} />
        )}
      </div>
    </div>
  )
}

// Properties panel (second level) - only for visibility management
const PropertiesPanel = ({ view }: { view: IView }) => {
  const { t } = useTranslation()
  const { tableName, space } = useContext(TableContext)
  const { uiColumns } = useUiColumns(tableName, space)
  const { updateView } = useViewOperation()

  const [cards, setCards] = useState<IField[]>([])
  const orderMap = view?.order_map || {}
  const hiddenFields = view?.hidden_fields || []

  const sortedUiColumns = useMemo(
    () =>
      sortBy(uiColumns, (item) => {
        return orderMap[item.table_column_name] || 0
      }),
    [orderMap, uiColumns]
  )

  useEffect(() => {
    setCards(sortedUiColumns)
  }, [sortedUiColumns])

  const updateHiddenFields = (newHiddenFields: string[]) => {
    if (!view) return
    updateView(view.id, { hidden_fields: newHiddenFields })
  }

  const handleHideField = (fieldId: string) => {
    if (!view) return
    const hiddenFieldsSet = new Set([...(hiddenFields || [])])
    if (hiddenFieldsSet.has(fieldId)) {
      hiddenFieldsSet.delete(fieldId)
    } else {
      hiddenFieldsSet.add(fieldId)
    }
    updateHiddenFields(Array.from(hiddenFieldsSet))
  }

  const showAllFields = () => {
    if (!view) return
    updateHiddenFields([])
  }

  const hideAllFields = () => {
    if (!view) return
    updateHiddenFields(
      uiColumns
        .filter((field) => field.table_column_name !== "title")
        .map((item) => item.table_column_name)
    )
  }

  const handleReorder = (newCards: IField[]) => {
    if (!view) return
    setCards(newCards)
    const newOrderMap: IView["order_map"] = {}
    newCards.forEach((item, index) => {
      newOrderMap[item.table_column_name] = index
    })
    updateView(view.id, { order_map: newOrderMap })
  }

  return (
    <div className="flex flex-col h-full -m-3 p-3">
      {/* Actions Header */}
      <div className="flex items-center justify-between px-0.5 mb-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {t("table.view.field.shownInView", "Shown in view")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={showAllFields}
            className="h-6 text-[11px] px-1.5"
          >
            {t("table.view.field.showAll")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={hideAllFields}
            className="h-6 text-[11px] px-1.5"
          >
            {t("table.view.field.hideAll")}
          </Button>
        </div>
      </div>

      {/* Properties list - takes remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SortableContainer
          items={cards.map((card) => ({
            ...card,
            id: card.table_column_name,
          }))}
          onReorder={handleReorder}
          className="h-full overflow-y-auto overflow-x-hidden -mx-1 px-1"
          renderItem={(item) => {
            const card = item as IField
            const isHidden =
              (hiddenFields || []).indexOf(card.table_column_name) !== -1
            return (
              <FieldItemCard
                field={card}
                key={card.table_column_name}
                index={0}
                id={card.table_column_name}
                isHidden={isHidden}
                text={card.name}
                onToggleHidden={handleHideField}
              />
            )
          }}
        />
      </div>
    </div>
  )
}

// Main ViewSettings component
export const ViewSettings = (props: { view: IView; onClose: () => void }) => {
  const { t } = useTranslation()
  const [currentPanel, setCurrentPanel] = useState<SettingsPanel>("main")
  const { view, onClose } = props

  const handleSelectPanel = (panel: SettingsPanel) => {
    setCurrentPanel(panel)
  }

  const handleBackToMain = () => {
    setCurrentPanel("main")
  }

  // Get panel title
  const getPanelTitle = () => {
    switch (currentPanel) {
      case "main":
        return t("table.view.settings", "View settings")
      case "layout":
        return t("table.viewType", "Layout")
      case "properties":
        return t("table.view.propertyVisibility", "Property visibility")
      default:
        return ""
    }
  }

  // Check if we should show back button
  const showBackButton = currentPanel !== "main"

  return (
    <div
      className={cn(
        "absolute right-0 top-0 h-full w-[280px] border-l bg-popover shadow-xl",
        "animate-in fade-in slide-in-from-right-2 duration-150"
      )}
      id="view-settings"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex-none border-b bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showBackButton && (
                <button
                  onClick={handleBackToMain}
                  className={cn(
                    "p-1 rounded-md shrink-0",
                    "text-muted-foreground hover:text-foreground",
                    "hover:bg-accent transition-colors"
                  )}
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <h3 className="text-xs font-semibold text-foreground truncate">
                {getPanelTitle()}
              </h3>
            </div>
            <button
              onClick={onClose}
              className={cn(
                "ml-2 p-1 rounded-md shrink-0",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-accent transition-colors"
              )}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className={cn(
            "flex-1 min-h-0",
            currentPanel === "properties"
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto"
          )}
        >
          <div
            className={cn(
              "h-full",
              currentPanel !== "properties" && "p-3 overflow-y-auto"
            )}
          >
            {currentPanel === "main" && (
              <MainMenu view={view} onSelectPanel={handleSelectPanel} />
            )}
            {currentPanel === "layout" && <LayoutPanel view={view} />}
            {currentPanel === "properties" && <PropertiesPanel view={view} />}
          </div>
        </div>
      </div>
    </div>
  )
}
