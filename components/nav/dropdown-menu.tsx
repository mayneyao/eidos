import {
  BlocksIcon,
  BookOpenIcon,
  Github,
  Keyboard,
  MoreHorizontal,
  MoveRightIcon,
  Settings,
  Trash2Icon,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { EIDOS_VERSION } from "@/lib/log"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes, useNode } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DiscordIcon } from "@/components/icons/discord"
import { NodeUpdateTime } from "@/app/[database]/[node]/node-update-time"

export function NavDropdownMenu() {
  const router = useNavigate()

  const { deleteNode } = useSqlite()
  const { setCmdkOpen, isCmdkOpen } = useAppRuntimeStore()
  const allTables = useAllNodes({
    type: "table",
  })
  const node = useCurrentNode()

  const { moveIntoTable } = useNode()

  const { space } = useCurrentPathInfo()
  const toggleCMDK = () => {
    setCmdkOpen(!isCmdkOpen)
  }
  const goSettings = () => {
    router("/settings")
  }

  const deleteCurrentNode = () => {
    if (node) {
      deleteNode(node)
      router(`/${space}`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>All data hosted on Local 🖥</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={toggleCMDK}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Command Palette</span>
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <Link to="/extensions">
            <DropdownMenuItem>
              <BlocksIcon className="mr-2 h-4 w-4" />
              <span>Extensions</span>
              {/* <DropdownMenuShortcut>⌘S</DropdownMenuShortcut> */}
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem onSelect={goSettings}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            {/* <DropdownMenuShortcut>⌘S</DropdownMenuShortcut> */}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <Link to="https://github.com/mayneyao/eidos" target="_blank">
          <DropdownMenuItem>
            <Github className="mr-2 h-4 w-4" />
            <span>GitHub</span>
          </DropdownMenuItem>
        </Link>
        <Link to="https://discord.gg/KAeDX8VEpK" target="_blank">
          <DropdownMenuItem>
            <DiscordIcon className="mr-2 h-4 w-4" />
            <span>Discord</span>
          </DropdownMenuItem>
        </Link>
        <Link to="https://wiki.eidos.space" target="_blank">
          <DropdownMenuItem>
            <BookOpenIcon className="mr-2 h-4 w-4" />
            <span>Wiki</span>
          </DropdownMenuItem>
        </Link>

        {node && (
          <>
            <DropdownMenuSeparator />
            {/* node related operate */}
            <DropdownMenuItem onClick={deleteCurrentNode}>
              <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
              <span>Delete</span>
            </DropdownMenuItem>
            {node.type === "doc" && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MoveRightIcon className="mr-2 h-4 w-4" />
                  Move Into
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[300px] w-48 overflow-y-scroll">
                  {allTables.map((tableNode) => (
                    <DropdownMenuItem
                      key={tableNode.id}
                      inset
                      onClick={() => {
                        moveIntoTable(node.id, tableNode.id, node.parent_id)
                      }}
                    >
                      {tableNode.name || "Untitled"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <NodeUpdateTime />
          </>
        )}

        <DropdownMenuSeparator />
        <span className="p-2 text-sm text-gray-500">
          Version: {EIDOS_VERSION}
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
