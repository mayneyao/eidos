import {
  EidosFileViewTabs as SharedEidosFileViewTabs,
  type EidosFileViewTabsProps,
} from "@eidos.space/eidos-file-ui/eidos-file-view-tabs"
import { Pencil, Settings2, Trash2 } from "lucide-react"

import {
  NativeContextMenu,
  NativeContextMenuContent,
  NativeContextMenuItem,
  NativeContextMenuSeparator,
  NativeContextMenuTrigger,
} from "@/components/ui/native-context-menu"

export * from "@eidos.space/eidos-file-ui/eidos-file-view-tabs"

export function EidosFileViewTabs(props: EidosFileViewTabsProps) {
  return (
    <SharedEidosFileViewTabs
      {...props}
      renderTab={(view, tab, actions) => (
        <NativeContextMenu>
          <NativeContextMenuTrigger asChild>{tab}</NativeContextMenuTrigger>
          <NativeContextMenuContent className="w-44">
            <NativeContextMenuItem
              disabled={actions.disabled}
              onClick={actions.rename}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename view
            </NativeContextMenuItem>
            <NativeContextMenuItem
              disabled={actions.disabled}
              onClick={actions.configure}
            >
              <Settings2 className="mr-2 h-3.5 w-3.5" />
              Configure view
            </NativeContextMenuItem>
            <NativeContextMenuSeparator />
            <NativeContextMenuItem
              disabled={!actions.canDelete}
              className="text-destructive focus:text-destructive"
              onClick={actions.delete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete view
            </NativeContextMenuItem>
          </NativeContextMenuContent>
        </NativeContextMenu>
      )}
    />
  )
}
