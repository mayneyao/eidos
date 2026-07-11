import { Eye, EyeOff, FolderCog } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function FileSpaceFilesSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const settings = useFileSpaceSettings((state) =>
    spaceId ? state.bySpace[spaceId] : undefined
  )
  const updateSettings = useFileSpaceSettings((state) => state.updateSettings)

  if (!spaceId || currentSpace?.mode !== "file") return null

  const showHiddenFiles = settings?.showHiddenFiles ?? false
  const showObsidianFolder = settings?.showObsidianFolder ?? false

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      <div className="pb-2">
        <h3>{t("space.settings.fileSpace.files.group", "Explorer")}</h3>
      </div>
      <hr />
      <div>
        <div className="divide-y divide-border/70">
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <FolderCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="show-obsidian-folder">
                  {t(
                    "space.settings.fileSpace.files.showObsidian",
                    "Show Obsidian configuration"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.files.showObsidianDescription",
                    "Include .obsidian in the Files tree. Eidos never changes it unless you edit those files directly."
                  )}
                </p>
              </div>
            </div>
            <Switch
              id="show-obsidian-folder"
              checked={showObsidianFolder}
              onCheckedChange={(checked) =>
                updateSettings(spaceId, { showObsidianFolder: checked })
              }
            />
          </div>
          <div className="flex min-h-[76px] items-center justify-between gap-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {showHiddenFiles ? (
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="space-y-0.5">
                <Label htmlFor="show-hidden-files">
                  {t(
                    "space.settings.fileSpace.files.showHidden",
                    "Show hidden files"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.files.showHiddenDescription",
                    "Show dotfiles in this Space. Private .eidos and .graft runtime directories always stay hidden."
                  )}
                </p>
              </div>
            </div>
            <Switch
              id="show-hidden-files"
              checked={showHiddenFiles}
              onCheckedChange={(checked) =>
                updateSettings(spaceId, { showHiddenFiles: checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
