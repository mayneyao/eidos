import React from "react"
import { ViewTypeEnum } from "@/packages/core/types/IView"
import { PlusIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useCustomTableViews } from "./hooks/use-custom-table-views"
import { ViewIconMap } from "./view-item"

interface AddViewDropdownProps {
  onAddView: (viewType: ViewTypeEnum | `ext__${string}`) => void
  isView: boolean
  isReadOnly?: boolean
}

export const AddViewDropdown = ({
  onAddView,
  isView,
  isReadOnly,
}: AddViewDropdownProps) => {
  const { t } = useTranslation()
  const { tableViews } = useCustomTableViews()

  if (isReadOnly) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-eidos="eidos.currentSpace.createDefaultView(tableName, type)"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Grid)}>
          <div className="flex items-center gap-2">
            {React.createElement(ViewIconMap[ViewTypeEnum.Grid], {
              className: "h-4 w-4",
            })}
            <span>{t("views.types.grid")}</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Gallery)}>
          <div className="flex items-center gap-2">
            {React.createElement(ViewIconMap[ViewTypeEnum.Gallery], {
              className: "h-4 w-4",
            })}
            <span>{t("views.types.gallery")}</span>
          </div>
        </DropdownMenuItem>
        {!isView && (
          <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Kanban)}>
            <div className="flex items-center gap-2">
              {React.createElement(ViewIconMap[ViewTypeEnum.Kanban], {
                className: "h-4 w-4",
              })}
              <span>{t("views.types.kanban")}</span>
            </div>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {tableViews.map((view) => {
          // Get the icon component, fallback to Grid icon if not found
          const IconComponent =
            ViewIconMap[view.type as keyof typeof ViewIconMap] ||
            ViewIconMap[ViewTypeEnum.Grid]

          return (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onAddView(`ext__${view.meta?.tableView?.type}`)}
            >
              <div className="flex items-center gap-2">
                {React.createElement(IconComponent, {
                  className: "h-4 w-4",
                })}
                <span>{view.meta?.tableView?.title}</span>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
