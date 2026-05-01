import { useEffect, useState } from "react"
import type { IExtension } from "@/packages/core/types/IExtension"
import { detectDirective } from "@eidos.space/v3"
import {
  ExternalLink,
  LayoutTemplate,
  SquareMousePointer,
  Plus,
  LayoutGrid,
  Bot,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { closeSettings } from "@/components/settings/settings-events"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"

export function NewTabSettings() {
  const { t } = useTranslation()
  const { sqlite } = useSqlite()
  const { navigate } = useRouterAdapter()
  const [newTabBlocks, setNewTabBlocks] = useState<IExtension[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBlockId, setSelectedBlockId] = useSqliteKV<string | null>(
    "eidos:space:settings:newtab",
    ""
  )

  useEffect(() => {
    if (!sqlite) return

    const loadNewTabBlocks = async () => {
      try {
        setIsLoading(true)
        const candidates = await sqlite.extension.findMany({
          where: {
            OR: [
              { code: { contains: '"use newtab"' } },
              { code: { contains: "'use newtab'" } },
            ],
          },
        })
        const blocks = (candidates as IExtension[]).filter(
          (ext) => ext.code && detectDirective(ext.code, "use newtab")
        )
        setNewTabBlocks(blocks)
      } catch (error) {
        console.error("Error loading new tab blocks:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadNewTabBlocks()
  }, [sqlite])

  const handleSelect = (value: string) => {
    setSelectedBlockId(value === "default" ? null : value)
  }

  if (isLoading) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {t("space.settings.newtab.loading", "Loading new tab options...")}
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* New Tab Page Section */}
      <div className="py-4 flex items-center gap-2">
        <LayoutGrid className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">
          {t("space.settings.newtab.title", "New Tab Page")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(
              "space.settings.newtab.description",
              "Choose what happens when you open a new tab."
            )}
          </p>

          <RadioGroup
            value={selectedBlockId || "default"}
            onValueChange={handleSelect}
            className="space-y-3"
          >
            {/* Default Option */}
            <div
              className="flex items-center gap-3 p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => handleSelect("default")}
            >
              <RadioGroupItem
                value="default"
                id="default"
                className="shrink-0"
              />
              <div className="p-2 rounded-md bg-muted shrink-0">
                <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <Label htmlFor="default" className="font-medium cursor-pointer">
                  {t("space.settings.newtab.default", "Default Dashboard")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "space.settings.newtab.defaultDescription",
                    "Standard start page with shortcuts and recent documents."
                  )}
                </p>
              </div>
            </div>

            {/* AI Agent Option */}
            <div
              className="flex items-center gap-3 p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => handleSelect("agent")}
            >
              <RadioGroupItem value="agent" id="agent" className="shrink-0" />
              <div className="p-2 rounded-md bg-muted shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <Label htmlFor="agent" className="font-medium cursor-pointer">
                  {t("space.settings.newtab.agent", "AI Agent")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "space.settings.newtab.agentDescription",
                    "Open the AI Agent interface for automated tasks and assistance."
                  )}
                </p>
              </div>
            </div>

            {/* Custom Blocks */}
            {newTabBlocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center gap-3 p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer group"
                onClick={() => handleSelect(block.id)}
              >
                <RadioGroupItem
                  value={block.id}
                  id={block.id}
                  className="shrink-0"
                />
                <div className="p-2 rounded-md bg-muted shrink-0">
                  <SquareMousePointer className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={block.id}
                    className="font-medium cursor-pointer"
                  >
                    {block.name || block.id}
                  </Label>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {block.description ||
                      t(
                        "space.settings.newtab.noDescription",
                        "No description"
                      )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeSettings()
                    navigate(`/blocks/${block.id}`)
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </RadioGroup>

          {/* Empty State Hint */}
          {newTabBlocks.length === 0 && (
            <div className="p-6 rounded-lg border border-dashed">
              <div className="flex items-start gap-3">
                <Plus className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "space.settings.newtab.noBlocks",
                      'No blocks with "use newtab" directive found.'
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(
                      "space.settings.newtab.addDirectiveHint",
                      'Add "use newtab"; to the top of your block code to make it available here.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
