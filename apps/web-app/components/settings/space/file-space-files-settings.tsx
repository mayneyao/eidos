import { Eye, EyeOff, FolderCog } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import { Switch } from "@/components/ui/switch"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.fileSpace.files.group", "Explorer")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<FolderCog />}
            htmlFor="show-obsidian-folder"
            title={t(
              "space.settings.fileSpace.files.showObsidian",
              "Show Obsidian configuration"
            )}
            description={t(
              "space.settings.fileSpace.files.showObsidianDescription",
              "Include .obsidian in the Files tree. Eidos never changes it unless you edit those files directly."
            )}
          >
            <Switch
              id="show-obsidian-folder"
              checked={showObsidianFolder}
              onCheckedChange={(checked) =>
                updateSettings(spaceId, { showObsidianFolder: checked })
              }
            />
          </SettingsRow>
          <SettingsRow
            icon={showHiddenFiles ? <Eye /> : <EyeOff />}
            htmlFor="show-hidden-files"
            title={t(
              "space.settings.fileSpace.files.showHidden",
              "Show hidden files"
            )}
            description={t(
              "space.settings.fileSpace.files.showHiddenDescription",
              "Show dotfiles in this Space. Private runtime state stays hidden; managed Agent sessions and Extension source remain visible."
            )}
          >
            <Switch
              id="show-hidden-files"
              checked={showHiddenFiles}
              onCheckedChange={(checked) =>
                updateSettings(spaceId, { showHiddenFiles: checked })
              }
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
