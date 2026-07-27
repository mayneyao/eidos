import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, Download, Puzzle, Filter } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useExtensionSettings } from "@/apps/web-app/hooks/use-extension-settings"
import { useEjectExtension } from "@/apps/web-app/hooks/use-eject-extension"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { builtInExtensions } from "@/extensions/builtin"

import { SettingsRows, SettingsSection } from "../settings-surface"
import { ExtensionPreview } from "./extension-preview"
import { FileExtensionSettings } from "./file-extension-settings"

const EXTENSIONS = builtInExtensions
  .map((ext) => {
    const meta = ext.meta as any
    let type: "sidebar" | "file-handler" | "folder-handler" | undefined
    let description = ""

    if (meta.type === "sidebarBlock") {
      type = "sidebar"
      description = meta.sidebarBlock?.description || ""
    } else if (meta.type === "fileHandler") {
      type = "file-handler"
      description = meta.fileHandler?.description || ""
    } else if (meta.type === "folderHandler") {
      type = "folder-handler"
      description = meta.folderHandler?.description || ""
    }

    if (!type) return null

    const id = ext.slug === "journal" ? "today" : ext.slug

    return {
      id,
      slug: ext.slug,
      title: (meta.sidebarBlock?.title ||
        meta.fileHandler?.title ||
        meta.folderHandler?.title ||
        ext.slug) as string,
      description,
      type,
    }
  })
  .filter(Boolean) as {
  id: string
  slug: string
  title: string
  description: string
  type: "sidebar" | "file-handler" | "folder-handler"
}[]

export function ExtensionSettings() {
  const { currentSpace } = useCurrentSpace()
  return currentSpace?.mode === "file" ? (
    <FileExtensionSettings />
  ) : (
    <LegacyExtensionSettings />
  )
}

function LegacyExtensionSettings() {
  const { t } = useTranslation()
  const { isExtensionEnabled, toggleExtension } = useExtensionSettings()
  const { eject, isEjecting, canEject } = useEjectExtension()
  const [filterType, setFilterType] = useState<
    "all" | "sidebar" | "file-handler" | "folder-handler"
  >("all")

  const filteredExtensions = EXTENSIONS.filter(
    (ext) => filterType === "all" || ext.type === filterType
  )

  const getFilterLabel = () => {
    switch (filterType) {
      case "sidebar":
        return t("space.settings.extensions.sidebarBlocks", "Sidebar Blocks")
      case "file-handler":
        return t("space.settings.extensions.fileHandlers", "File Handlers")
      case "folder-handler":
        return t("space.settings.extensions.folderHandlers", "Folder Handlers")
      default:
        return t("space.settings.extensions.allTypes", "All Types")
    }
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t("settings.extensions.title")}
        description={t(
          "space.settings.extensions.description",
          "Manage built-in extensions for this space."
        )}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-between">
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  {getFilterLabel()}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuItem onClick={() => setFilterType("all")}>
                {t("space.settings.extensions.allTypes", "All Types")}
              </DropdownMenuItem>

              <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger asChild>
                  <DropdownMenuItem onClick={() => setFilterType("sidebar")}>
                    {t(
                      "space.settings.extensions.sidebarBlocks",
                      "Sidebar Blocks"
                    )}
                  </DropdownMenuItem>
                </HoverCardTrigger>
                <HoverCardContent
                  side="left"
                  align="start"
                  className="w-[320px] p-0 border-none bg-transparent shadow-none"
                  avoidCollisions
                >
                  <div className="bg-background border border-border rounded-lg shadow-lg">
                    <ExtensionPreview type="sidebar" />
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger asChild>
                  <DropdownMenuItem
                    onClick={() => setFilterType("file-handler")}
                  >
                    {t(
                      "space.settings.extensions.fileHandlers",
                      "File Handlers"
                    )}
                  </DropdownMenuItem>
                </HoverCardTrigger>
                <HoverCardContent
                  side="left"
                  align="start"
                  className="w-[320px] p-0 border-none bg-transparent shadow-none"
                  avoidCollisions
                >
                  <div className="bg-background border border-border rounded-lg shadow-lg">
                    <ExtensionPreview type="file-handler" />
                  </div>
                </HoverCardContent>
              </HoverCard>

              <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger asChild>
                  <DropdownMenuItem
                    onClick={() => setFilterType("folder-handler")}
                  >
                    {t(
                      "space.settings.extensions.folderHandlers",
                      "Folder Handlers"
                    )}
                  </DropdownMenuItem>
                </HoverCardTrigger>
                <HoverCardContent
                  side="left"
                  align="start"
                  className="w-[320px] p-0 border-none bg-transparent shadow-none"
                  avoidCollisions
                >
                  <div className="bg-background border border-border rounded-lg shadow-lg">
                    <ExtensionPreview type="folder-handler" />
                  </div>
                </HoverCardContent>
              </HoverCard>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {filteredExtensions.length === 0 ? (
          <div className="py-4">
            <div className="p-8 text-center border border-dashed rounded-lg">
              <Puzzle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {t(
                  "space.settings.extensions.noExtensions",
                  "No extensions found for this filter."
                )}
              </p>
            </div>
          </div>
        ) : (
          <SettingsRows>
            {filteredExtensions.map((ext) => (
              <div
                key={ext.id}
                className="flex items-center justify-between gap-6 py-4"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label
                      htmlFor={`extension-${ext.id}`}
                      className="font-medium cursor-pointer"
                    >
                      {ext.title}
                    </Label>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {ext.type === "sidebar"
                        ? t("space.settings.extensions.sidebar", "Sidebar")
                        : ext.type === "file-handler"
                          ? t(
                              "space.settings.extensions.fileHandler",
                              "File Handler"
                            )
                          : t(
                              "space.settings.extensions.folderHandler",
                              "Folder Handler"
                            )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {ext.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canEject(ext.slug) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => eject(ext.slug)}
                      disabled={isEjecting}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {t("space.settings.extensions.eject", "Eject")}
                    </Button>
                  )}
                  <Switch
                    id={`extension-${ext.id}`}
                    checked={isExtensionEnabled(ext.id)}
                    onCheckedChange={() => toggleExtension(ext.id)}
                  />
                </div>
              </div>
            ))}
          </SettingsRows>
        )}
      </SettingsSection>
    </div>
  )
}
