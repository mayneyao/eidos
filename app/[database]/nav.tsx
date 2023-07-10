import { Link, useNavigate } from "react-router-dom";

import {
  Bot,
  Cloud,
  Github,
  Keyboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  RotateCcw,
  Settings,
  Share2,
} from "lucide-react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { usePeer } from "@/hooks/use-peer"
import { useTable } from "@/hooks/use-table"
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
import { AvatarList } from "@/components/avatar-list"
import { ShareDialog } from "@/components/share-dialog"

import { useSpaceAppStore } from "./store"

export function DropdownMenuDemo() {
  const router = useNavigate();
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
          {/* <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            <span>Command Palette</span>
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem> */}
          {/* <DropdownMenuItem>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing</span>
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem> */}
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
        {/* <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Users className="mr-2 h-4 w-4" />
            <span>Team</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Invite users</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Mail className="mr-2 h-4 w-4" />
                  <span>Email</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span>Message</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  <span>More...</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Team</span>
            <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Github className="mr-2 h-4 w-4" />
          <Link to="https://github.com/mayneyao/eidos" target="_blank">
            <span>GitHub</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LifeBuoy className="mr-2 h-4 w-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Cloud className="mr-2 h-4 w-4" />
          <span>API</span>
        </DropdownMenuItem>
        {/* <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const Nav = () => {
  const { isAiOpen, setIsAiOpen, isSidebarOpen, setSidebarOpen } =
    useSpaceAppStore()

  const { space:database, tableName: table } = useCurrentPathInfo()
  const { reload } = useTable(table ?? "", database)
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
    <div className="flex h-8 w-full border-separate items-center justify-between border-b">
      {!isSidebarOpen && (
        <Button variant="ghost" size="sm" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
        </Button>
      )}
      <div className="grow" />
      <div className="flex justify-between self-end">
        <AvatarList nameList={nameList} />
        <Button variant="ghost" onClick={reload}>
          <RotateCcw className="h-5 w-5" />
        </Button>
        {!isShareMode && <ShareDialog />}
        <Button variant="ghost" onClick={toggleAi}>
          <Bot className="h-5 w-5" />
        </Button>
        <DropdownMenuDemo></DropdownMenuDemo>
      </div>
    </div>
  )
}
