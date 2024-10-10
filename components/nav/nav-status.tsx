import {
  BotIcon,
  Cable,
  FileBoxIcon,
  LockIcon,
  LucideIcon,
  PinIcon,
  PinOffIcon,
  Unplug
} from "lucide-react"

import { AvatarList } from "@/components/avatar-list"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAPIAgent } from "@/hooks/use-api-agent"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useNodeTree } from "@/hooks/use-node-tree"
import { usePeer } from "@/hooks/use-peer"
import { isDesktopMode } from "@/lib/env"

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

export const NavStatus = () => {
  const {
    isRightPanelOpen,
    setIsRightPanelOpen,
    isExtAppOpen,
    setIsExtAppOpen,
    apps,
    currentAppIndex,
    setCurrentAppIndex,
  } = useSpaceAppStore()
  const { connected } = useAPIAgent()

  const { currentCollaborators } = usePeer()
  const nameList = currentCollaborators.map((c) => c.name)
  const currentNode = useCurrentNode()
  const { pin, unpin } = useNodeTree()

  const handleAppChange = (index: number) => {
    if (index === currentAppIndex) {
      setIsRightPanelOpen(false)
    } else {
      setIsRightPanelOpen(true, index)
    }
  }

  return (
    <>
      <AvatarList nameList={nameList} />
      {Boolean(currentNode?.is_locked) && (
        <Button
          size="xs"
          variant="ghost"
          title="this node is locked (read-only)"
          className=" flex gap-1 opacity-60"
        >
          <LockIcon className="h-4 w-4" /> Locked
        </Button>
      )}
      {!isDesktopMode && (
        <div
          className="px-2"
          title={connected ? "API Agent Connected" : "No API Agent Connected"}
        >
          {connected ? (
            <Cable className="h-5 w-5 text-green-500" />
          ) : (
            <Unplug className="h-5 w-5 text-red-500" />
          )}
        </div>
      )}
      {currentNode && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {currentNode?.is_pinned ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="rounded-b-none relative"
                    onClick={() => unpin(currentNode.id)}
                  >
                    <PinOffIcon className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="rounded-b-none relative"
                    onClick={() => pin(currentNode.id)}
                  >
                    <PinIcon className="h-5 w-5" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {currentNode?.is_pinned
                    ? "Click to unpin this node"
                    : "Click to pin this node"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </>
  )
}
