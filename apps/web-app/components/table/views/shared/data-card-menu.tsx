import { MoveDiagonalIcon, MoveUpRightIcon, Trash2Icon } from "lucide-react"

import { getRawTableNameById, shortenId } from "@/lib/utils"
import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuTrigger as ContextMenuTrigger,
} from "@/components/ui/native-context-menu"
import { useCurrentSubPage } from "@/apps/web-app/hooks/use-current-sub-page"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"

interface DataCardProps {
  item: Record<string, any>
  tableId: string
  space: string
  children: React.ReactNode
  isView?: boolean
}

export const DataCardMenu = ({
  item,
  tableId,
  space,
  children,
  isView,
}: DataCardProps) => {
  const goto = useGoto()
  const { getOrCreateTableSubDoc } = useSqlite()
  const { deleteRowsByIds } = useTableOperation(
    getRawTableNameById(tableId),
    space
  )

  const deleteItem = async () => {
    await deleteRowsByIds([item._id], getRawTableNameById(tableId))
  }

  const { setSubPage } = useCurrentSubPage()

  const openRow = async (right?: boolean) => {
    if (!item) {
      return
    }
    const shortId = shortenId(item._id)

    await getOrCreateTableSubDoc({
      docId: shortId,
      title: item.title,
      tableId: tableId!,
    })

    if (right) {
      setSubPage(shortId)
    } else {
      goto(space, shortId)
    }
  }

  if (isView) {
    return children
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-64"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ContextMenuItem
          onClick={(e) => {
            console.log("openRow", e)
            openRow(true)
          }}
        >
          <MoveUpRightIcon className="pr-2" />
          Open
        </ContextMenuItem>
        <ContextMenuItem onClick={() => openRow()}>
          <MoveDiagonalIcon className="pr-2" />
          Open in full page
        </ContextMenuItem>
        <ContextMenuItem onClick={deleteItem}>
          <Trash2Icon className="pr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
