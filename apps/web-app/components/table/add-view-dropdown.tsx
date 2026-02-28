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
import { ViewIcon } from "./view-icon"

interface AddViewDropdownProps {
  onAddView: (viewType: ViewTypeEnum | `ext__${string}`) => void
  isView: boolean
  isReadOnly?: boolean
  tableName?: string
}

export const AddViewDropdown = ({
  onAddView,
  isView,
  isReadOnly,
  tableName,
}: AddViewDropdownProps) => {
  const { t } = useTranslation()
  const { tableViews } = useCustomTableViews(tableName)

  if (isReadOnly) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-eidos="eidos.currentSpace.view.createDefaultView(tableName, type)"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Grid)}>
          <div className="flex items-center gap-2">
            <ViewIcon viewType="grid" className="h-4 w-4" />
            <span>{t("views.types.grid")}</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Gallery)}>
          <div className="flex items-center gap-2">
            <ViewIcon viewType="gallery" className="h-4 w-4" />
            <span>{t("views.types.gallery")}</span>
          </div>
        </DropdownMenuItem>
        {!isView && (
          <DropdownMenuItem onClick={() => onAddView(ViewTypeEnum.Kanban)}>
            <div className="flex items-center gap-2">
              <ViewIcon viewType="kanban" className="h-4 w-4" />
              <span>{t("views.types.kanban")}</span>
            </div>
          </DropdownMenuItem>
        )}
        {tableViews.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {tableViews.map((view) => {
          return (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onAddView(`ext__${view.meta?.tableView?.type}`)}
            >
              <div className="flex items-center gap-2">
                <ViewIcon 
                  viewType={`ext__${view.meta?.tableView?.type}`} 
                  className="h-4 w-4" 
                />
                <span>{view.meta?.tableView?.title}</span>
              </div>
            </DropdownMenuItem>
          )
        })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
