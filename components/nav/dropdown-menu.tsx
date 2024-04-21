import { useState } from "react"
import {
  BlocksIcon,
  BookOpenIcon,
  CogIcon,
  Github,
  Keyboard,
  MoreHorizontal,
  PackageIcon,
  Trash2Icon,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { EIDOS_VERSION } from "@/lib/log"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
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

import { NodeMoveInto } from "../node-menu/move-into"
import { NodeExport } from "../node-menu/node-export"
import { Switch } from "../ui/switch"

export function NavDropdownMenu() {
  const router = useNavigate()
  const [open, setOpen] = useState(false)

  const { deleteNode, toggleNodeFullWidth } = useSqlite()
  const { setCmdkOpen, isCmdkOpen } = useAppRuntimeStore()

  const node = useCurrentNode()

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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost">
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
          {/* <Link to="/extensions">
            <DropdownMenuItem>
              <BlocksIcon className="mr-2 h-4 w-4" />
              <span>Extensions</span>
            </DropdownMenuItem>
          </Link> */}
          <DropdownMenuItem onSelect={goSettings}>
            <CogIcon className="mr-2 h-4 w-4" />
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
            {node.type === "doc" && (
              <DropdownMenuItem
                className="flex justify-between"
                onClick={(e) => {
                  e.preventDefault()
                  toggleNodeFullWidth(node)
                }}
              >
                Full Width
                <Switch checked={node.is_full_width} />
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* node related operate */}
            <NodeExport node={node} />
            {node.type === "doc" && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <PackageIcon className="pr-2" />
                    Move Into
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <NodeMoveInto node={node} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            <DropdownMenuItem onClick={deleteCurrentNode}>
              <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
              <span>Delete</span>
            </DropdownMenuItem>
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
