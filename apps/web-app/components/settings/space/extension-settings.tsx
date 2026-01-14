import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useExtensionSettings } from "@/apps/web-app/hooks/use-extension-settings"
import { builtInExtensions } from "@/extensions/builtin"
import { cn } from "@/lib/utils"

import { ExtensionPreview } from "./extension-preview"

// Derive extensions from built-in registry
const EXTENSIONS = builtInExtensions
  .map((ext) => {
    const meta = ext.meta as any
    let type: "sidebar" | "file-handler" | undefined
    let description = ""

    if (meta.type === "sidebarBlock") {
      type = "sidebar"
      description = meta.sidebarBlock?.description || ""
    } else if (meta.type === "fileHandler") {
      type = "file-handler"
      description = meta.fileHandler?.description || ""
    }

    if (!type) return null

    // Legacy mapping for journal -> today
    const id = ext.slug === "journal" ? "today" : ext.slug

    return {
      id,
      title: (meta.sidebarBlock?.title || meta.fileHandler?.title || ext.slug) as string,
      description,
      type,
    }
  })
  .filter(Boolean) as {
  id: string
  title: string
  description: string
  type: "sidebar" | "file-handler"
}[]

export function ExtensionSettings() {
  const { t } = useTranslation()
  const { isExtensionEnabled, toggleExtension } = useExtensionSettings()
  const [filterType, setFilterType] = useState<"all" | "sidebar" | "file-handler">("all")

  const filteredExtensions = EXTENSIONS.filter(
    (ext) => filterType === "all" || ext.type === filterType
  )

  const getFilterLabel = () => {
      switch(filterType) {
          case "sidebar": return "Sidebar Blocks"
          case "file-handler": return "File Handlers"
          default: return "All Types"
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between py-4 border-b">
        <h3 className="text-lg font-medium">{t("settings.extensions.title")}</h3>
        
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-between">
                    {getFilterLabel()}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => setFilterType("all")}>
                    All Types
                </DropdownMenuItem>
                
                <HoverCard openDelay={0} closeDelay={0}>
                    <HoverCardTrigger asChild>
                        <DropdownMenuItem onClick={() => setFilterType("sidebar")}>
                            Sidebar Blocks
                        </DropdownMenuItem>
                    </HoverCardTrigger>
                    <HoverCardContent side="left" align="start" className="w-[320px] p-0 border-none bg-transparent shadow-none" avoidCollisions>
                        <div className="bg-background border rounded-lg shadow-lg">
                            <ExtensionPreview type="sidebar" />
                        </div>
                    </HoverCardContent>
                </HoverCard>

                <HoverCard openDelay={0} closeDelay={0}>
                     <HoverCardTrigger asChild>
                        <DropdownMenuItem onClick={() => setFilterType("file-handler")}>
                            File Handlers
                        </DropdownMenuItem>
                    </HoverCardTrigger>
                    <HoverCardContent side="left" align="start" className="w-[320px] p-0 border-none bg-transparent shadow-none" avoidCollisions>
                         <div className="bg-background border rounded-lg shadow-lg">
                            <ExtensionPreview type="file-handler" />
                        </div>
                    </HoverCardContent>
                </HoverCard>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-6">
        {/* Extension List - Full Width */}
        <div className="flex-1 space-y-4">
          {filteredExtensions.map((ext) => (
            <div
              key={ext.id}
              className="flex items-center justify-between rounded-lg border p-4 shadow-sm hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-default"
            >
              <div className="space-y-0.5">
                <Label
                  htmlFor={`extension-${ext.id}`}
                  className="text-base font-semibold cursor-pointer flex items-center gap-2"
                >
                  {ext.title}
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase tracking-wide font-medium">
                    {ext.type === "sidebar" ? "Sidebar" : "File Handler"}
                  </span>
                </Label>
                <div className="text-sm text-muted-foreground max-w-[500px]">
                  {ext.description}
                </div>
              </div>
              <Switch
                id={`extension-${ext.id}`}
                checked={isExtensionEnabled(ext.id)}
                onCheckedChange={() => toggleExtension(ext.id)}
              />
            </div>
          ))}

          {filteredExtensions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
              No extensions found for this filter.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
