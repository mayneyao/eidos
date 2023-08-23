import {
  Bot,
  Cable,
  Cloud,
  Github,
  Keyboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  Settings,
  Unplug,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AvatarList } from "@/components/avatar-list"
import { ShareDialog } from "@/components/share-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAPIAgent } from "@/hooks/use-api-agent"
import { useCurrentNodePath } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { usePeer } from "@/hooks/use-peer"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

import { useSpaceAppStore } from "./store"

export function DropdownMenuDemo() {
  const router = useNavigate()
  const { setCmdkOpen, isCmdkOpen } = useAppRuntimeStore()
  const toggleCMDK = () => {
    setCmdkOpen(!isCmdkOpen)
  }
  const goSettings = () => {
    router("/settings")
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
        <DropdownMenuItem>
          <LifeBuoy className="mr-2 h-4 w-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Cloud className="mr-2 h-4 w-4" />
          <span>API</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const BreadCrumb = () => {
  const paths = useCurrentNodePath()
  const { space } = useCurrentPathInfo()
  return (
    <div className="flex items-center">
      {paths.map((p, i) => (
        <div key={p.id} className="flex items-center">
          <Link to={`/${space}/${p.id}`} className="text-sm">
            {p.name || "Untitled"}
          </Link>
          {i !== paths.length - 1 && (
            <span className="mx-1 text-sm text-gray-400">/</span>
          )}
        </div>
      ))}
    </div>
  )
}

export const Nav = () => {
  const { isAiOpen, setIsAiOpen, isSidebarOpen, setSidebarOpen } =
    useSpaceAppStore()
  const { connected } = useAPIAgent()

  const { currentCollaborators } = usePeer()
  const nameList = currentCollaborators.map((c) => c.name)
  const { isShareMode } = useAppRuntimeStore()

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }
  const toggleAi = () => {
    setIsAiOpen(!isAiOpen)
  }

  return (
    <div className="flex h-8 w-full border-separate items-center justify-between">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSidebar}
        className="hidden md:block"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <BreadCrumb />
      <div className="grow" />
      <div className="flex justify-between self-end">
        <AvatarList nameList={nameList} />
        <div
          className="p-2"
          title={connected ? "API Agent Connected" : "No API Agent Connected"}
        >
          {connected ? (
            <Cable className="h-5 w-5 text-green-500" />
          ) : (
            <Unplug className="h-5 w-5 text-red-500" />
          )}
        </div>
        {!isShareMode && <ShareDialog />}
        <Button variant="ghost" onClick={toggleAi}>
          <Bot className="h-5 w-5" />
        </Button>
        <DropdownMenuDemo></DropdownMenuDemo>
      </div>
    </div>
  )
}
