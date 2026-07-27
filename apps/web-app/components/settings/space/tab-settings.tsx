import { useEffect, useState } from "react"
import type { IExtension } from "@/packages/core/types/IExtension"
import { detectDirective } from "@eidos.space/v3"
import {
  ExternalLink,
  LayoutTemplate,
  SquareMousePointer,
  Plus,
  Bot,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

export function TabsSettings() {
  const { t } = useTranslation()
  const { sqlite } = useSqlite()
  const { navigate } = useRouterAdapter()
  const [newTabBlocks, setNewTabBlocks] = useState<IExtension[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedBlockId, setSelectedBlockId] = useSqliteKV<string | null>(
    "eidos:space:settings:newtab",
    ""
  )

  const [alwaysOpenInNewTab, setAlwaysOpenInNewTab] = useSqliteKV<boolean>(
    "eidos:space:settings:alwaysOpenInNewTab",
    false
  )

  const [reuseExistingTab, setReuseExistingTab] = useSqliteKV<boolean>(
    "eidos:space:settings:reuseExistingTab",
    true
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
        {t("space.settings.tabs.newtab.loading", "Loading tab options...")}
      </div>
    )
  }

  const selectedValue = selectedBlockId || "default"

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.tabs.behavior", "Tab Behavior")}
      >
        <SettingsRows>
          <SettingsRow
            title={t(
              "space.settings.tabs.alwaysOpenInNewTab",
              "Always Open in New Tab"
            )}
            description={t(
              "space.settings.tabs.alwaysOpenInNewTabDescription",
              "When enabled, internal navigation will always open in a new tab."
            )}
          >
            <Switch
              checked={!!alwaysOpenInNewTab}
              onCheckedChange={setAlwaysOpenInNewTab}
            />
          </SettingsRow>
          <SettingsRow
            title={t(
              "space.settings.tabs.reuseExistingTab",
              "Reuse Existing Tab"
            )}
            description={t(
              "space.settings.tabs.reuseExistingTabDescription",
              "When enabled, documents or related pages (like journals) that are already open will reuse their existing tabs."
            )}
          >
            <Switch
              checked={!!reuseExistingTab}
              onCheckedChange={setReuseExistingTab}
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection
        title={t("space.settings.tabs.newtab.title", "New Tab Page")}
        description={t(
          "space.settings.tabs.newtab.description",
          "Choose what happens when you open a new tab."
        )}
      >
        <RadioGroup
          value={selectedValue}
          onValueChange={handleSelect}
          className="divide-y divide-border/70"
        >
          {/* Default Option */}
          <div
            className={cn(
              "flex cursor-pointer items-center gap-3 py-4",
              selectedValue === "default" && "-mx-5 bg-muted/40 px-5"
            )}
            onClick={() => handleSelect("default")}
          >
            <RadioGroupItem value="default" id="default" className="shrink-0" />
            <div className="shrink-0 rounded-md bg-muted p-2">
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="default" className="cursor-pointer font-medium">
                {t("space.settings.tabs.newtab.default", "Default Dashboard")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  "space.settings.tabs.newtab.defaultDescription",
                  "Standard start page with shortcuts and recent documents."
                )}
              </p>
            </div>
          </div>

          {/* AI Agent Option */}
          <div
            className={cn(
              "flex cursor-pointer items-center gap-3 py-4",
              selectedValue === "agent" && "-mx-5 bg-muted/40 px-5"
            )}
            onClick={() => handleSelect("agent")}
          >
            <RadioGroupItem value="agent" id="agent" className="shrink-0" />
            <div className="shrink-0 rounded-md bg-muted p-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="agent" className="cursor-pointer font-medium">
                {t("space.settings.tabs.newtab.agent", "AI Agent")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  "space.settings.tabs.newtab.agentDescription",
                  "Open the AI Agent interface for automated tasks and assistance."
                )}
              </p>
            </div>
          </div>

          {/* Custom Blocks */}
          {newTabBlocks.map((block) => (
            <div
              key={block.id}
              className={cn(
                "group flex cursor-pointer items-center gap-3 py-4",
                selectedValue === block.id && "-mx-5 bg-muted/40 px-5"
              )}
              onClick={() => handleSelect(block.id)}
            >
              <RadioGroupItem
                value={block.id}
                id={block.id}
                className="shrink-0"
              />
              <div className="shrink-0 rounded-md bg-muted p-2">
                <SquareMousePointer className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor={block.id}
                  className="cursor-pointer font-medium"
                >
                  {block.name || block.id}
                </Label>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {block.description ||
                    t(
                      "space.settings.tabs.newtab.noDescription",
                      "No description"
                    )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
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
          <div className="border-t border-border/70 py-6">
            <div className="flex items-start gap-3">
              <Plus className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "space.settings.tabs.newtab.noBlocks",
                    'No blocks with "use newtab" directive found.'
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "space.settings.tabs.newtab.addDirectiveHint",
                    'Add "use newtab"; to the top of your block code to make it available here.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
