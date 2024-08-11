import {
  Bot,
  Cable,
  LockIcon,
  PanelRightIcon,
  PinIcon,
  PinOffIcon,
  Unplug,
} from "lucide-react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useAPIAgent } from "@/hooks/use-api-agent"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useNodeTree } from "@/hooks/use-node-tree"
import { usePeer } from "@/hooks/use-peer"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AvatarList } from "@/components/avatar-list"

import { useSpaceAppStore } from "../../apps/web-app/[database]/store"

export const NavStatus = () => {
  const { isAiOpen, setIsAiOpen, isExtAppOpen, setIsExtAppOpen } =
    useSpaceAppStore()
  const { connected } = useAPIAgent()

  const { currentCollaborators } = usePeer()
  const nameList = currentCollaborators.map((c) => c.name)
  const currentNode = useCurrentNode()
  const { pin, unpin } = useNodeTree()

  const toggleAi = () => {
    setIsAiOpen(!isAiOpen)
  }
  const toggleExtApp = () => {
    setIsExtAppOpen(!isExtAppOpen)
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
      {currentNode && (
        <>
          <div
            title={
              currentNode?.is_pinned
                ? "this node is pinned, click to unpin"
                : "click to pin this node"
            }
          >
            {currentNode?.is_pinned ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => unpin(currentNode.id)}
              >
                <PinOffIcon className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => pin(currentNode.id)}
              >
                <PinIcon className="h-5 w-5" />
              </Button>
            )}
          </div>
        </>
      )}
      {/* {!isShareMode && <ShareDialog />} */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="ghost" onClick={toggleAi}>
              <Bot className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Chat with AI <br />
              <span className={"ml-auto text-xs tracking-widest opacity-60"}>
                ctrl/cmd + /
              </span>
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="ghost" onClick={toggleExtApp}>
              <PanelRightIcon className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>App Side Panel</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )
}
