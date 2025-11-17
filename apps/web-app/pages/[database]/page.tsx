import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  FileText,
  Command,
  Settings,
  Search,
  PanelLeft,
} from "lucide-react"

import { EidosIcon } from "@/components/icons/eidos"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

// Helper function to render keyboard shortcut
const renderShortcut = (keys: string) => {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
  const parts = keys.split(" + ").map((key) => {
    // Replace Ctrl/Cmd with platform-specific key
    if (key === "Ctrl/Cmd") {
      return isMac ? "⌘" : "Ctrl"
    }
    return key
  })

  return (
    <div className="flex items-center gap-1">
      {parts.map((key, index) => (
        <span key={index}>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {key}
          </kbd>
          {index < parts.length - 1 && (
            <span className="mx-0.5 text-muted-foreground text-[10px]">+</span>
          )}
        </span>
      ))}
    </div>
  )
}

export default function DatabaseHome() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { createDoc } = useSqlite(space)
  const goto = useGoto()
  const { setCmdkOpen, setGlobalSearchOpen, setSpaceSettingsOpen } =
    useAppRuntimeStore()
  const { toggleSidebar } = useSidebar()

  const handleCreateDoc = useCallback(async () => {
    if (!space) return
    const docId = await createDoc("")
    if (docId) {
      goto(space, docId)
    }
  }, [space, createDoc, goto])

  const handleOpenCommandPalette = useCallback(() => {
    setCmdkOpen(true)
  }, [setCmdkOpen])

  const handleOpenGlobalSearch = useCallback(() => {
    setGlobalSearchOpen(true)
  }, [setGlobalSearchOpen])

  const handleOpenSettings = useCallback(() => {
    setSpaceSettingsOpen(true)
  }, [setSpaceSettingsOpen])

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar()
  }, [toggleSidebar])

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        {/* Logo */}
        <div className="opacity-30 scale-75">
          <EidosIcon />
        </div>

        {/* Quick Actions */}
        <div className="w-full">
          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              className="h-auto px-3 py-2"
              onClick={handleCreateDoc}
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("welcome.newDocument", "New Document")}
                  </span>
                </div>
                {renderShortcut("Ctrl/Cmd + N")}
              </div>
            </Button>

            <Button
              variant="ghost"
              className="h-auto px-3 py-2"
              onClick={handleOpenCommandPalette}
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Command className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("welcome.commandPalette", "Command Palette")}
                  </span>
                </div>
                {renderShortcut("Ctrl/Cmd + K")}
              </div>
            </Button>

            <Button
              variant="ghost"
              className="h-auto px-3 py-2"
              onClick={handleOpenGlobalSearch}
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("welcome.nodesSearch", "Nodes Search")}
                  </span>
                </div>
                {renderShortcut("Ctrl/Cmd + P")}
              </div>
            </Button>

            <Button
              variant="ghost"
              className="h-auto px-3 py-2"
              onClick={handleToggleSidebar}
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <PanelLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("welcome.toggleSidebar", "Toggle Sidebar")}
                  </span>
                </div>
                {renderShortcut("Ctrl/Cmd + \\")}
              </div>
            </Button>

            <Button
              variant="ghost"
              className="h-auto px-3 py-2"
              onClick={handleOpenSettings}
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("welcome.settings", "Settings")}
                  </span>
                </div>
                {renderShortcut("Ctrl/Cmd + ,")}
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
