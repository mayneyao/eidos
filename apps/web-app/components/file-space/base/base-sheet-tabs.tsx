import type { ReactNode } from "react"
import type { BaseTableInfo } from "@eidos.space/base"
import { BaseSheetTabStrip } from "@eidos.space/base-ui/base-editor-chrome"
import { Pencil, Trash2 } from "lucide-react"

import {
  NativeContextMenu,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuSeparator,
  NativeContextMenuTrigger,
} from "@/components/ui/native-context-menu"

export function BaseSheetTabs({
  tables,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  onRename,
  onDelete,
}: {
  tables: BaseTableInfo[]
  activeTableId: string | null
  disabled?: boolean
  status?: ReactNode
  createAction?: ReactNode
  onSelect: (tableId: string) => void
  onRename?: (table: BaseTableInfo) => void
  onDelete?: (table: BaseTableInfo) => void
}) {
  return (
    <BaseSheetTabStrip
      tables={tables}
      activeTableId={activeTableId}
      disabled={disabled}
      status={status}
      createAction={createAction}
      onSelect={onSelect}
      renderTab={(table, tab) => (
        <NativeContextMenu>
          <NativeContextMenuTrigger asChild>{tab}</NativeContextMenuTrigger>
          <NativeContextMenuContent className="w-44">
            <NativeContextMenuItem
              disabled={disabled || !onRename}
              onClick={() => onRename?.(table)}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename table
            </NativeContextMenuItem>
            <NativeContextMenuSeparator />
            <NativeContextMenuItem
              disabled={disabled || !onDelete}
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(table)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete table
            </NativeContextMenuItem>
          </NativeContextMenuContent>
        </NativeContextMenu>
      )}
    />
  )
}
