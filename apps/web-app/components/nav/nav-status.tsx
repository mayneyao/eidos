import {
  Cable,
  Cog,
  Database,
  LockIcon,
  PinIcon,
  PinOffIcon,
  Unplug,
  Wand2,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useAPIAgent } from "@/apps/web-app/hooks/use-api-agent"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useNode } from "@/apps/web-app/hooks/use-nodes"
import { usePeer } from "@/apps/web-app/hooks/use-peer"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceSyncStatus } from "@/apps/web-app/hooks/use-sync-status"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { AvatarList } from "@/components/avatar-list"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getFileExtension,
  useDefaultHandler,
  useFileHandlers,
} from "@/hooks/use-file-handlers"
import { isDesktopMode } from "@/lib/env"
import { isDayPageId } from "@/lib/utils"

import { SetDefaultHandlerDialog } from "./set-default-handler-dialog"

export const NavStatus = () => {
  const { t } = useTranslation()
  const { location } = useRouterAdapter()

  // Parse search params from location
  const searchParams = new URLSearchParams(location.search)

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

  // Check if we're on file-handler page
  const isFileHandlerPage = location.pathname.includes("/file-handler")
  const handlerIdFromQuery = isFileHandlerPage
    ? searchParams.get("handler")
    : null
  const filePath =
    isFileHandlerPage && location.hash.startsWith("#")
      ? location.hash.substring(1)
      : isFileHandlerPage
        ? location.hash
        : ""
  const fileExtension = filePath ? getFileExtension(filePath) : ""

  // Only call hooks when on file-handler page to avoid unnecessary requests
  const { handlers } = useFileHandlers(isFileHandlerPage ? fileExtension : "")
  const {
    defaultHandlerId,
    setDefaultHandler,
    isLoading: isLoadingDefault,
  } = useDefaultHandler(isFileHandlerPage ? fileExtension : "")

  // Find current handler (from query param or default)
  const currentHandlerId = handlerIdFromQuery || defaultHandlerId
  const currentHandler = handlers.find((h) => h.id === currentHandlerId)
  const defaultHandler = handlers.find((h) => h.id === defaultHandlerId)

  // Check if current handler differs from default handler
  const effectiveDefaultHandlerId = defaultHandlerId || handlers[0]?.id

  const shouldShowSetDefaultButton =
    isFileHandlerPage &&
    fileExtension &&
    handlerIdFromQuery &&
    handlerIdFromQuery !== effectiveDefaultHandlerId &&
    !isLoadingDefault &&
    currentHandler

  const [showSetDefaultDialog, setShowSetDefaultDialog] = useState(false)

  const handleSetAsDefault = async () => {
    if (currentHandlerId && setDefaultHandler) {
      await setDefaultHandler(currentHandlerId)
      // Remove handler query param to use the new default
      const newSearchParams = new URLSearchParams(location.search)
      newSearchParams.delete("handler")
      const newSearch = newSearchParams.toString()
      window.history.replaceState(
        {},
        "",
        `${location.pathname}${newSearch ? `?${newSearch}` : ""}${location.hash}`
      )
      setShowSetDefaultDialog(false)
    }
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
      {shouldShowSetDefaultButton && (
        <>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setShowSetDefaultDialog(true)}
          >
            {t("file.handler.setAsDefault", "Set as default")}
          </Button>
          <SetDefaultHandlerDialog
            open={showSetDefaultDialog}
            onOpenChange={setShowSetDefaultDialog}
            currentHandler={currentHandler || null}
            defaultHandler={defaultHandler || null}
            fileExtension={fileExtension}
            onConfirm={handleSetAsDefault}
          />
        </>
      )}
    </>
  )
}
