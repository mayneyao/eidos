import {
  EidosFileSheetTabs as SharedEidosFileSheetTabs,
  type EidosFileSheetTabsProps,
} from "@eidos.space/eidos-file-ui/eidos-file-sheet-tabs"
import { Pencil, Trash2 } from "lucide-react"

import {
  NativeContextMenu,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuSeparator,
  NativeContextMenuTrigger,
} from "@/components/ui/native-context-menu"

export * from "@eidos.space/eidos-file-ui/eidos-file-sheet-tabs"

export function EidosFileSheetTabs(props: EidosFileSheetTabsProps) {
  return (
    <SharedEidosFileSheetTabs
      {...props}
      renderTab={(table, tab, actions) => (
        <NativeContextMenu>
          <NativeContextMenuTrigger asChild>{tab}</NativeContextMenuTrigger>
          <NativeContextMenuContent className="w-44">
            <NativeContextMenuItem
              disabled={actions.disabled}
              onClick={actions.rename}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename table
            </NativeContextMenuItem>
            <NativeContextMenuSeparator />
            <NativeContextMenuItem
              disabled={!actions.canDelete}
              className="text-destructive focus:text-destructive"
              onClick={actions.delete}
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
