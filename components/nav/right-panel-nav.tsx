import {
  BotIcon,
  LucideIcon,
  PanelRightIcon,
  PlusIcon,
  ToyBrickIcon,
  Trash2,
} from "lucide-react"

import { cn, getBlockIdFromUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAllMblocks } from "@/apps/web-app/[database]/scripts/hooks/use-all-mblocks"

import {
  useAppsStore,
  useSpaceAppStore,
} from "../../apps/web-app/[database]/store"
import { BlockContextMenu } from "./block-context-menu"

const DefaultAppInfoMap: Record<
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
}

export const RightPanelNav = () => {
  const { setIsRightPanelOpen, currentAppIndex, setCurrentAppIndex, setApps } =
    useSpaceAppStore()
  const { apps, addApp, deleteApp } = useAppsStore()

  const handleAppChange = (index: number) => {
    setCurrentAppIndex(index)
  }
  const mblocks = useAllMblocks()
  const getAppInfo = (app: string) => {
    if (app.startsWith("block://")) {
      const id = getBlockIdFromUrl(app)
      const block = mblocks.find((mblock) => mblock.id === id)
      if (!block) {
        return null
      }
      return {
        icon: ToyBrickIcon,
        title: block?.name,
        description: block?.description,
        shortcut: undefined,
      }
    }
    return DefaultAppInfoMap[app]
  }
  const updateApp = (app: string, newUrl: string) => {
    const newApps = apps.map((oldUrl) => (oldUrl === app ? newUrl : oldUrl))
    console.log("newApps", { apps, newApps, app, newUrl })
    setApps(newApps)
  }

  return (
    <div className="flex gap-2 justify-between w-full">
      <div className="flex gap-2">
        {apps.map((app, index) => {
          const appInfo = getAppInfo(app)
          if (!appInfo) {
            return (
              <TooltipProvider key={app}>
                <Tooltip>
                  <TooltipTrigger className="cursor-not-allowed">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled
                      onClick={() => handleAppChange(index)}
                    >
                      <ToyBrickIcon className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This block is not available in current space</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }
          const { icon: Icon, title, description, shortcut } = appInfo
          const isCurrentApp = index === currentAppIndex
          const isBlock = app.startsWith("block://")
          return (
            <TooltipProvider key={app}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    {isBlock ? (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleAppChange(index)}
                            className={cn("rounded-b-none relative", {
                              "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary":
                                isCurrentApp,
                            })}
                          >
                            <Icon className="h-5 w-5" />
                          </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => {
                              deleteApp(app)
                              setCurrentAppIndex(0)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </ContextMenuItem>
                          <BlockContextMenu
                            url={app}
                            setUrl={(newUrl) => updateApp(app, newUrl)}
                          />
                        </ContextMenuContent>
                      </ContextMenu>
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleAppChange(index)}
                        className={cn("rounded-b-none relative", {
                          "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary":
                            isCurrentApp,
                        })}
                      >
                        <Icon className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="rounded-b-none">
              <PlusIcon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {mblocks.map((block) => (
              <DropdownMenuItem
                key={block.id}
                onClick={() => {
                  addApp(`block://${block.id}`)
                  setCurrentAppIndex(apps.length) // Set focus to the newly added app
                }}
              >
                <div className="flex items-center gap-2">
                  <ToyBrickIcon className="h-5 w-5" />
                  <span>{block.name}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="drag-region grow"></div>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setIsRightPanelOpen(false, -1)}
      >
        <PanelRightIcon className="h-5 w-5" />
      </Button>
    </div>
  )
}
