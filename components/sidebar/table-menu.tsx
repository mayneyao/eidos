import { useRouter } from "next/navigation"

import { IFileNode, useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface INodeItemProps {
  databaseName: string
  node: IFileNode
  children?: React.ReactNode
}

export function NodeItem({ databaseName, children, node }: INodeItemProps) {
  const { duplicateTable, deleteNode } = useSqlite(databaseName)
  const router = useRouter()
  const handleDeleteTable = () => {
    deleteNode(node)
    router.push(`/${databaseName}`)
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset onClick={handleDeleteTable}>
          Remove
          <ContextMenuShortcut>del</ContextMenuShortcut>
        </ContextMenuItem>
        {/* <ContextMenuItem inset disabled>
          Forward
          <ContextMenuShortcut>⌘]</ContextMenuShortcut>
        </ContextMenuItem> */}
        {node.type === "table" && (
          <ContextMenuItem
            inset
            onClick={() => duplicateTable(node.name, `${node.name}_copy`)}
            disabled
          >
            Duplicate
            {/* <ContextMenuShortcut>⌘R</ContextMenuShortcut> */}
          </ContextMenuItem>
        )}

        <ContextMenuSub>
          <ContextMenuSubTrigger inset>Export </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {/* <ContextMenuItem>
              Export As...
              <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut>
            </ContextMenuItem> */}
            <ContextMenuItem disabled>Csv(.csv)</ContextMenuItem>
            <ContextMenuItem disabled>Excel(.xlsx)</ContextMenuItem>
            {/* <ContextMenuSeparator /> */}
            {/* <ContextMenuItem>Developer Tools</ContextMenuItem> */}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/*<ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>
          Show Bookmarks Bar
          <ContextMenuShortcut>⌘⇧B</ContextMenuShortcut>
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>Show Full URLs</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup value="pedro">
          <ContextMenuLabel inset>People</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioItem value="pedro">
            Pedro Duarte
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="colm">Colm Tuite</ContextMenuRadioItem>
        </ContextMenuRadioGroup> */}
      </ContextMenuContent>
    </ContextMenu>
  )
}
