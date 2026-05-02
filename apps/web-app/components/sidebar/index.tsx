"use client"

import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { SpaceSelect } from "@/components/space-select"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/ui/sidebar"

import { SidebarContent } from "./sidebar-content"
import { SidebarTabs } from "./sidebar-tabs"
import { Trash } from "./trash"

const SidebarFooter = () => {
  const { t } = useTranslation()
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()
  const { navigate } = useRouterAdapter()

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
            className="h-8 w-8 p-0 cursor-pointer"
            title={t("common.settings")}
            onClick={handleOpenSettings}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export const SideBar = () => {
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
