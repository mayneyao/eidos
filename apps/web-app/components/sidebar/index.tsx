"use client"

import { SettingsIcon, Trash2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { SpaceSelect } from "@/components/space-select"
import { SettingsSidebar } from "@/apps/web-app/components/settings/settings-sidebar"
import { isSettingsUrl } from "@/apps/web-app/components/settings/settings-navigation"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/ui/sidebar"

import { SidebarContent } from "./sidebar-content"
import { SidebarTabs } from "./sidebar-tabs"
import { SidebarUpdateStatus } from "./update-status"

const SidebarFooter = () => {
  const { t } = useTranslation()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const { navigate, location } = useRouterAdapter()

  const isSettingsActive = isSettingsUrl(location.pathname)
  const isTrashActive = location.pathname.startsWith("/trash")

  const handleOpenSettings = () => {
    navigate("/settings", { target: "_blank" })
  }

  const handleOpenTrash = () => {
    navigate("/trash")
  }

  return (
    <div className="mt-auto p-1 py-[7px]">
      <div className="flex items-center justify-between gap-1">
        {!isShareMode && <SpaceSelect spaces={spaceList} />}
        <div className="flex items-center gap-1">
          <SidebarUpdateStatus />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 cursor-pointer relative",
              isTrashActive
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t("common.trash")}
            onClick={handleOpenTrash}
          >
            {isTrashActive && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            )}
            <Trash2Icon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 cursor-pointer relative",
              isSettingsActive
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t("common.settings")}
            onClick={handleOpenSettings}
          >
            {isSettingsActive && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            )}
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export const SideBar = () => {
  const { location } = useRouterAdapter()
  const isSettingsRoute = isSettingsUrl(location.pathname)

  if (isSettingsRoute) {
    return (
      <Sidebar>
        <SettingsSidebar />
      </Sidebar>
    )
  }

  return (
    <Sidebar>
      <SidebarTabs />

      <div className="flex-1 min-h-0 overflow-hidden">
        <SidebarContent />
      </div>

      <SidebarFooter />
    </Sidebar>
  )
}
