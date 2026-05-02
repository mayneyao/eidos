"use client"

import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { SpaceSelect } from "@/components/space-select"
import { SettingsSidebar } from "@/apps/web-app/components/settings/settings-sidebar"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/ui/sidebar"

import { SidebarContent } from "./sidebar-content"
import { SidebarTabs } from "./sidebar-tabs"
import { Trash } from "./trash"

const SidebarFooter = () => {
  const { t } = useTranslation()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const { navigate, location } = useRouterAdapter()

  const isSettingsActive = location.pathname.startsWith("/settings")

  const handleOpenSettings = () => {
    navigate("/settings", { target: "_blank" })
  }

  return (
    <div className="mt-auto border-t border-sidebar-border p-1 py-[7px]">
      <div className="flex items-center justify-between gap-1">
        {!isShareMode && <SpaceSelect spaces={spaceList} />}
        <div className="flex items-center gap-1">
          <Trash />
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
  const isSettingsRoute = location.pathname.startsWith("/settings")

  return (
    <Sidebar>
      <SidebarTabs />

      <div className="flex-1 min-h-0 overflow-hidden">
        {isSettingsRoute ? <SettingsSidebar /> : <SidebarContent />}
      </div>

      <SidebarFooter />
    </Sidebar>
  )
}
