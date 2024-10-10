import {
    BotIcon,
    FileBoxIcon,
    LucideIcon,
    PanelRightIcon
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { useSpaceAppStore } from "../../apps/web-app/[database]/store"

const AppInfoMap: Record<
  string,
  {
    icon: LucideIcon
    title: string
    description: string
    shortcut?: string
  }
> = {
  chat: {
    icon: BotIcon,
    title: "Chat with AI",
    description: "Chat with AI",
    // shortcut: "ctrl/cmd + /",
  },
  ext: {
    icon: FileBoxIcon,
    title: "File Manager",
    description: "File Manager",
  },
  "file-manager": {
    icon: FileBoxIcon,
    title: "File Manager",
    description: "File Manager",
  },
}

export const RightPanelNav = () => {
  const { setIsRightPanelOpen, apps, currentAppIndex, setCurrentAppIndex } =
    useSpaceAppStore()

  const handleAppChange = (index: number) => {
    setCurrentAppIndex(index)
  }

  return (
    <div className="flex gap-2 justify-between w-full">
      {apps.map((app, index) => {
        const { icon: Icon, title, description, shortcut } = AppInfoMap[app]
        const isCurrentApp = index === currentAppIndex
        return (
          <TooltipProvider key={title}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleAppChange(index)}
                  className={cn("rounded-b-none relative", {
                    "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary":
                      isCurrentApp, // Add underline using ::after
                  })}
                >
                  <Icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {title} <br />
                  <span
                    className={"ml-auto text-xs tracking-widest opacity-60"}
                  >
                    {shortcut}
                  </span>
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setIsRightPanelOpen(false, -1)}
      >
        <PanelRightIcon className="h-5 w-5" />
      </Button>
      {/* <DropdownMenu>
        <DropdownMenuTrigger asChild></DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px]">
          {apps.map((app) => {
            const { icon: Icon, title } = AppInfoMap[app]
            return (
              <DropdownMenuItem key={title} className="flex justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {title}
                </div>
                <PinIcon className="h-4 w-4 ml-auto" />
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu> */}
    </div>
  )
}
