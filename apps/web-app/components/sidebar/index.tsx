"use client"

import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { Sidebar, SidebarRail } from "@/components/ui/sidebar"
import { DatabaseSelect } from "@/components/database-select"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { SpaceSettings } from "../settings"
import { ImportFileDialog } from "./import-file"
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

      <div className="mt-auto border-t border-sidebar-border p-1">
        <div className="flex items-center justify-between gap-1">
          {!isShareMode && <DatabaseSelect databases={spaceList} />}
          <div className="flex items-center gap-1">
            <Trash />
            <ImportFileDialog />
            <SpaceSettings />
          </div>
        </div>
      </div>
    </Sidebar>
  )
}
