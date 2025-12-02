import { useEffect, useMemo, useRef, useState } from "react"
import {
  BotIcon,
  ExternalLinkIcon,
  FileIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PlusIcon,
  ToyBrickIcon,
  Trash2,
  ViewIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { cn, getBlockIdFromUrl, isDayPageId } from "@/lib/utils"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
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
import { Link } from "@/components/ui/link"
import { AIChatHeader } from "@/components/ai-chat/ai-chat-header"
import { useAllMblocks } from "@/apps/web-app/hooks/use-all-mblocks"
import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import {
  useAppsStore,
  useSpaceAppStore,
} from "@/apps/web-app/pages/[database]/store"

import { BlockContextMenu } from "./block-context-menu"
import { NodeAppPanel } from "./node-app-panel"
import { NodeContextMenu } from "./node-context-menu"

const DefaultAppInfoMap: Record<
  string,
  {
    icon: LucideIcon | string
    title: string
    description: string
    shortcut?: string
    available: boolean
  }
> = {
  chat: {
    icon: BotIcon,
    title: "Chat with AI",
    description: "Chat with AI",
    // shortcut: "ctrl/cmd + /",
    available: true,
  },
}

export const RightPanelNav = () => {
  const {
    setIsRightPanelOpen,
    setCurrentApp,
    currentApp,
    setApps,
    tempPanelNode,
    setTempPanelNode,
  } = useSpaceAppStore()
  const { apps, addApp, deleteApp } = useAppsStore()
  const { space } = useCurrentPathInfo()
  const { t } = useTranslation()
  const { navigate } = useRouterAdapter()
  const nodeMap = useNodeMap()

  const handleAppChange = (app: string) => {
    // Clear tempPanelNode when switching to a currentApp
    setCurrentApp(app)
  }
  const handleAddApp = (blockId: string) => {
    const app = `block://${blockId}@${space}`
    addApp(app)
    setCurrentApp(app)
  }
  const displayApps = useMemo(() => {
    return apps.filter((app) => {
      if (app.startsWith("block://")) {
        const id = getBlockIdFromUrl(app)
        const [blockId, blockSpace] = id.split("@")
        return blockSpace === space
      }
      if (app.startsWith("node://")) {
        const id = getBlockIdFromUrl(app)
        const [nodeId, nodeSpace] = id.split("@")
        return nodeSpace === space
      }
      return true
    })
  }, [apps, space])

  const { mblocks } = useAllMblocks()

  const displayMblocks = useMemo(() => {
    return mblocks.filter((mblock) => {
      return !apps.includes(`block://${mblock.id}@${space}`)
    })
  }, [mblocks, apps, space])

  const getAppInfo = (app: string) => {
    if (app.startsWith("block://")) {
      const id = getBlockIdFromUrl(app)
      const [blockId, blockSpace] = id.split("@")
      if (blockSpace !== space) {
        return {
          icon: ToyBrickIcon,
          title: t("common.tips.blockNotInCurrentSpace", {
            space: blockSpace,
          }),
          shortcut: undefined,
          available: false,
        }
      }
      const block = mblocks.find((mblock) => mblock.id === blockId)
      if (!block) {
        return {
          icon: ToyBrickIcon,
          title: t("common.tips.notFoundBlock"),
          shortcut: undefined,
          available: false,
        }
      }
      const icon =
        block.icon && block.icon.startsWith("data:image")
          ? block.icon
          : ToyBrickIcon
      return {
        icon,
        title: block?.name,
        shortcut: undefined,
        available: true,
      }
    }
    if (app.startsWith("node://")) {
      const id = getBlockIdFromUrl(app)
      const [nodeIdWithSchema, nodeSpace] = id.split("@")
      const nodeId = nodeIdWithSchema.split("://")[1]
      if (nodeSpace !== space) {
        return {
          icon: FileIcon,
          title: t("common.tips.nodeNotInCurrentSpace", {
            space: nodeSpace,
          }),
          shortcut: undefined,
          available: false,
        }
      }
      // Get actual node data from nodeMap
      const node = nodeMap[nodeId]
      if (!node) {
        return {
          icon: FileIcon,
          title: t("common.tips.notFoundNode"),
          shortcut: undefined,
          available: false,
        }
      }
      return {
        icon: ViewIcon, // Use ViewIcon for dataview nodes
        title: node.name || `Node ${nodeId}`,
        shortcut: undefined,
        available: true,
      }
    }
    return DefaultAppInfoMap[app]
  }
  const updateApp = (app: string, newUrl: string) => {
    const newApps = apps.map((oldUrl) => (oldUrl === app ? newUrl : oldUrl))
    setApps(newApps)
  }

  const [visibleCount, setVisibleCount] = useState(5)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateVisibleCount = () => {
      if (!containerRef.current) return
      const containerWidth = containerRef.current.offsetWidth
      const availableWidth = containerWidth - 100
      const possibleCount = Math.floor(availableWidth / 40)
      setVisibleCount(Math.max(1, possibleCount))
    }

    const resizeObserver = new ResizeObserver(updateVisibleCount)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [])

  const cleanMessages = () => {
    // setChatHistory([])
  }

  const handleOpenTempNode = () => {
    if (!tempPanelNode) return

    if (isDayPageId(tempPanelNode.id)) {
      navigate(`/journals/${tempPanelNode.id}`)
    } else {
      navigate(`/${tempPanelNode.id}`)
    }
    // Clear temp node and close panel to ensure mutual exclusion
    setTempPanelNode(null)
    setCurrentApp("chat")
    setIsRightPanelOpen(false)
  }

  const handleCloseTempNode = () => {
    // Clear temp node to ensure mutual exclusion
    setTempPanelNode(null)
    setCurrentApp("chat")
    setIsRightPanelOpen(false)
  }

  return (
    <div className="flex gap-2 justify-between w-full" ref={containerRef}>
      <div className="flex gap-2 overflow-hidden">
        {displayApps.slice(0, visibleCount).map((app, index) => {
          const appInfo = getAppInfo(app)
          const { icon: IconOrUri, title, shortcut } = appInfo ?? {}
          const isCurrentApp = app === currentApp
          const isBlock = app.startsWith("block://")
          const isNode = app.startsWith("node://")
          return (
            <div key={app} className="relative">
              {isBlock || isNode ? (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleAppChange(app)}
                      className={cn("rounded-b-none relative", {
                        "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary":
                          isCurrentApp,
                        "opacity-50": !appInfo?.available,
                      })}
                    >
                      {typeof IconOrUri === "string" ? (
                        <img src={IconOrUri} alt={title} className="h-4 w-4" />
                      ) : (
                        IconOrUri && <IconOrUri className="h-4 w-4" />
                      )}
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <div className="px-2 py-1.5 text-sm font-medium border-b">
                      {title}
                    </div>
                    <ContextMenuItem
                      onClick={() => {
                        deleteApp(app)
                        setCurrentApp("chat")
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </ContextMenuItem>
                    {isBlock && (
                      <BlockContextMenu
                        url={app}
                        setUrl={(newUrl) => updateApp(app, newUrl)}
                      />
                    )}
                    {isNode && <NodeContextMenu url={app} />}
                  </ContextMenuContent>
                </ContextMenu>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleAppChange(app)}
                  className={cn("rounded-b-none relative", {
                    "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary":
                      isCurrentApp,
                  })}
                >
                  {typeof IconOrUri === "string" ? (
                    <img src={IconOrUri} alt={title} className="h-4 w-4" />
                  ) : (
                    IconOrUri && <IconOrUri className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          )
        })}

        {displayApps.length > visibleCount && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="ghost" className="rounded-b-none">
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {displayApps.slice(visibleCount).map((app, index) => {
                const appInfo = getAppInfo(app)
                const { icon: IconOrUri, title } = appInfo ?? {}
                return (
                  <DropdownMenuItem
                    key={app}
                    onClick={() => handleAppChange(app)}
                  >
                    <div className="flex items-center gap-2">
                      {typeof IconOrUri === "string" ? (
                        <img src={IconOrUri} alt={title} className="h-4 w-4" />
                      ) : (
                        IconOrUri && <IconOrUri className="h-4 w-4" />
                      )}
                      <span>{title}</span>
                    </div>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="rounded-b-none">
              <PlusIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {mblocks.length === 0 && (
              <p className="p-2 text-sm text-gray-500">
                There are no blocks in this space. Try to{" "}
                <Link
                  to={`/extensions`}
                  className="flex items-center gap-2 text-blue-500"
                >
                  <span>create block</span>
                </Link>
              </p>
            )}
            {displayMblocks.map((block) => (
              <DropdownMenuItem
                key={block.id}
                onClick={() => {
                  handleAddApp(block.id)
                }}
              >
                <div className="flex items-center gap-2">
                  {block.icon && block.icon.startsWith("data:image") ? (
                    <img
                      src={block.icon}
                      alt={block.name}
                      className="h-4 w-4"
                    />
                  ) : (
                    <ToyBrickIcon className="h-4 w-4" />
                  )}
                  <span>{block.name}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="drag-region grow"></div>
      {/* Only show currentApp UI when tempPanelNode is not active */}
      {!tempPanelNode && currentApp === "chat" && <AIChatHeader />}
      {/* Only show tempPanelNode UI when currentApp is not active */}
      {tempPanelNode && !currentApp && (
        <>
          <Button
            size="xs"
            variant="ghost"
            onClick={handleOpenTempNode}
            title={`Open ${tempPanelNode.name} in new tab`}
          >
            <ExternalLinkIcon className="h-4 w-4" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={handleCloseTempNode}
            title="Close temporary panel"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setIsRightPanelOpen(false, -1)}
      >
        <PanelRightIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}
