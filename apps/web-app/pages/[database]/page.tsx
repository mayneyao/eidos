import { useCallback } from "react"
import { Command, FileText, PanelLeft, Search, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { EidosIcon } from "@/components/icons/eidos"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabTitle } from "@/hooks/use-tab-title"

export default function DatabaseHome() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { createDoc } = useSqlite(space)
  const goto = useGoto()
  const { setCmdkOpen, setGlobalSearchOpen, setSpaceSettingsOpen } =
    useAppRuntimeStore()
  const { toggleSidebar } = useSidebar()

  useTabTitle("Home")

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
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl flex flex-col items-center gap-8">
        <div className="opacity-30 scale-75">
          <EidosIcon />
        </div>
        <div className="w-full flex flex-col gap-1.5">
          <Button
            variant="ghost"
            className="justify-between h-auto px-3 py-2"
            onClick={handleCreateDoc}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("welcome.newDocument", "New Document")}
              </span>
            </div>
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘ + N
            </kbd>
          </Button>

          <Button
            variant="ghost"
            className="justify-between h-auto px-3 py-2"
            onClick={handleOpenCommandPalette}
          >
            <div className="flex items-center gap-2">
              <Command className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("welcome.commandPalette", "Command Palette")}
              </span>
            </div>
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘ + K
            </kbd>
          </Button>

          <Button
            variant="ghost"
            className="justify-between h-auto px-3 py-2"
            onClick={handleOpenGlobalSearch}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("welcome.searchNodes", "Search Nodes")}
              </span>
            </div>
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘ + P
            </kbd>
          </Button>

          <Button
            variant="ghost"
            className="justify-between h-auto px-3 py-2"
            onClick={handleToggleSidebar}
          >
            <div className="flex items-center gap-2">
              <PanelLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("welcome.toggleSidebar", "Toggle Sidebar")}
              </span>
            </div>
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘ + \
            </kbd>
          </Button>

          <Button
            variant="ghost"
            className="justify-between h-auto px-3 py-2"
            onClick={handleOpenSettings}
          >
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("welcome.settings", "Settings")}
              </span>
            </div>
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘ + ,
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  )
}
