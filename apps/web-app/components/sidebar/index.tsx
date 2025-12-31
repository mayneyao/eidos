"use client"

import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { SpaceSelect } from "@/components/space-select"
import { Sidebar, SidebarRail } from "@/components/ui/sidebar"

import { SpaceSettings } from "../settings"
import { SidebarContent } from "./sidebar-content"
import { SidebarTabs } from "./sidebar-tabs"
import { Trash } from "./trash"

export const SideBar = () => {
  const { spaceList } = useSpace()
  const { isShareMode } = useAppRuntimeStore()

  return (
    <Sidebar className="h-full flex flex-col">
      <SidebarRail />

      <SidebarTabs />

      <div className="flex-1 min-h-0">
        <SidebarContent />
      </div>

      <div className="mt-auto border-t border-sidebar-border p-1 py-[7px]">
        <div className="flex items-center justify-between gap-1">
          {!isShareMode && <SpaceSelect spaces={spaceList} />}
          <div className="flex items-center gap-1">
            <Trash />
            <SpaceSettings />
          </div>
        </div>
      </div>
    </Sidebar>
  )
}
