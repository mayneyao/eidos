import { useState, type CSSProperties } from "react"
import { ArrowLeft, GitBranch, PanelLeftClose, Settings } from "lucide-react"

import { cn } from "@/lib/utils"
import { isMacDesktop } from "@/lib/web/helper"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { SpaceSelect } from "@/components/space-select"
import { SettingsSidebar } from "@/apps/web-app/components/settings/settings-sidebar"
import { isSettingsUrl } from "@/apps/web-app/components/settings/settings-navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"

import { FileSpaceTree } from "./file-tree"
import { DocumentNavigationPanel } from "./document-navigation-panel"
import { filePathFromSpaceUrl } from "./file-path"
import { navigateAfterFlushingSpaceFile } from "./file-navigation"
import { VersionPanel } from "./versioning/version-panel"

type FileSpaceSidebarView = "files" | "version"

export function FileSpaceSidebar() {
  const { currentSpace } = useCurrentSpace()
  const { spaceList } = useSpace()
  const { navigate, location } = useRouterAdapter()
  const { toggle: toggleSidebar, width } = useSidebar()
  const [activeView, setActiveView] = useState<FileSpaceSidebarView>("files")
  const showViewLabels = width >= 280
  if (!currentSpace) return null

  if (isSettingsUrl(location.pathname)) {
    return (
      <Sidebar>
        <SettingsSidebar />
      </Sidebar>
    )
  }

  const openSpaceSettings = async () => {
    const currentFilePath = filePathFromSpaceUrl(
      location.pathname + location.search + location.hash
    )
    const saved = await navigateAfterFlushingSpaceFile({
      spaceId: currentSpace.id,
      currentFilePath,
      destination: "/settings/space-general",
      navigate,
    })
    if (!saved) {
      window.alert(
        "Eidos could not save the current file. Resolve the error before leaving it."
      )
    }
  }

  return (
    <Sidebar>
      <SidebarHeader
        className={cn(
          "eidos-shell-titlebar drag-region shrink-0 border-b border-sidebar-border/60 bg-muted/60 px-1 py-0",
          isMacDesktop() && "!pl-[72px]"
        )}
      >
        <nav
          className="flex h-full min-w-0 items-center gap-1"
          aria-label="Space sidebar navigation"
        >
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-sidebar-foreground/55 outline-hidden transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={toggleSidebar}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              "ml-auto flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[3px] px-1.5 text-[11px] font-medium text-sidebar-foreground/65 outline-hidden transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
              !showViewLabels && "w-7 px-0"
            )}
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            aria-label={
              activeView === "files" ? "Open Version" : "Back to Files"
            }
            title={activeView === "files" ? "Open Version" : "Back to Files"}
            onClick={() =>
              setActiveView(activeView === "files" ? "version" : "files")
            }
          >
            {activeView === "files" ? (
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            )}
            {showViewLabels ? (
              <span className="truncate">
                {activeView === "files" ? "Version" : "Files"}
              </span>
            ) : (
              <span className="sr-only">
                {activeView === "files" ? "Version" : "Files"}
              </span>
            )}
          </button>
        </nav>
      </SidebarHeader>
      <SidebarContent className="px-0 py-0">
        {activeView === "files" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <FileSpaceTree spaceId={currentSpace.id} />
            </div>
            <DocumentNavigationPanel spaceId={currentSpace.id} />
          </div>
        ) : (
          <VersionPanel spaceId={currentSpace.id} />
        )}
      </SidebarContent>
      <SidebarFooter className="eidos-shell-statusbar shrink-0 p-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <SpaceSelect spaces={spaceList} variant="sidebar-footer" />
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            title="Space settings"
            aria-label="Space settings"
            onClick={() => void openSpaceSettings()}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
