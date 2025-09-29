import {
  Cable,
  Cog,
  LockIcon,
  PinIcon,
  PinOffIcon,
  Unplug,
  Wand2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { isDayPageId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AvatarList } from "@/components/avatar-list"
import { useAPIAgent } from "@/apps/web-app/hooks/use-api-agent"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
import { usePeer } from "@/apps/web-app/hooks/use-peer"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { SyncStatusIndicator } from "../sync-status-indicator"

export const NavStatus = () => {
  const { t } = useTranslation()

  const { isGodMode, setGodMode } = useAppRuntimeStore()

  const { connected } = useAPIAgent()
  const { runningCommand } = useAppRuntimeStore()

  const { currentCollaborators } = usePeer()
  const nameList = currentCollaborators.map((c) => c.name)
  const currentNode = useCurrentNode()
  const { pin, unpin } = useNode()

  const toggleGodMode = () => {
    setGodMode(!isGodMode)
  }

  return (
    <>
      {isGodMode && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleGodMode}
          title={t("nav.status.creatorMode", "Creator Mode - Click to disable")}
        >
          <Wand2 className="h-4 w-4" />
        </Button>
      )}
      {runningCommand && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="animate-spin">
                <Cog className="h-5 w-5 text-blue-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                <span className="font-semibold">{runningCommand}</span> is
                running
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <SyncStatusIndicator />
      <AvatarList nameList={nameList} />
      {Boolean(currentNode?.is_locked) && (
        <Button
          size="xs"
          variant="ghost"
          title={t("nav.status.nodeLocked")}
          className=" flex gap-1 opacity-60"
        >
          <LockIcon className="h-4 w-4" /> {t("common.lock")}
        </Button>
      )}
      {!isDesktopMode && (
        <div
          className="px-2"
          title={
            connected
              ? t("nav.status.apiAgentConnected")
              : t("nav.status.noApiAgentConnected")
          }
        >
          {connected ? (
            <Cable className="h-5 w-5 text-green-500" />
          ) : (
            <Unplug className="h-5 w-5 text-red-500" />
          )}
        </div>
      )}
      {currentNode &&
        currentNode.type === "doc" &&
        !isDayPageId(currentNode.id) && (
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
                      ? t("nav.status.clickToUnpin")
                      : t("nav.status.clickToPin")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
    </>
  )
}
