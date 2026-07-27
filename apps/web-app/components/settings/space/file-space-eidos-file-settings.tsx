import { FolderOpen, LayoutTemplate } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import {
  SettingsRow,
  SettingsRowContent,
  SettingsRowControl,
  SettingsRows,
  SettingsRowSurface,
  SettingsSection,
  SettingsSectionHeader,
} from "@/components/settings/settings-surface"
import { Label } from "@/components/ui/label"

export function FileSpaceBaseSettings() {
  const { t } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const settings = useFileSpaceSettings((state) =>
    spaceId ? state.bySpace[spaceId] : undefined
  )
  const updateSettings = useFileSpaceSettings((state) => state.updateSettings)

  if (!spaceId || currentSpace?.mode !== "file") return null

  const defaultEidosFileTemplate = settings?.defaultEidosFileTemplate ?? "blank"
  const eidosFileAssetFolder = settings?.eidosFileAssetFolder ?? "space-assets"

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t("space.settings.fileSpace.eidosFile.group", "Defaults")}
      />
      <SettingsRowSurface>
        <SettingsRows>
          <SettingsRow>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <SettingsRowContent>
                <Label htmlFor="file-space-eidos-file-template">
                  {t(
                    "space.settings.fileSpace.eidosFile.defaultTemplate",
                    "Default template"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.eidosFile.defaultTemplateDescription",
                    "Preselect a starting point when creating an Eidos File. You can still choose another template before creation."
                  )}
                </p>
              </SettingsRowContent>
            </div>
            <SettingsRowControl>
              <select
                id="file-space-eidos-file-template"
                aria-label={t(
                  "space.settings.fileSpace.eidosFile.defaultTemplate",
                  "Default template"
                )}
                className="h-8 w-full min-w-40 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring sm:w-auto"
                value={defaultEidosFileTemplate}
                onChange={(event) =>
                  updateSettings(spaceId, {
                    defaultEidosFileTemplate:
                      event.target.value === "tasks" ? "tasks" : "blank",
                  })
                }
              >
                <option value="blank">
                  {t(
                    "space.settings.fileSpace.eidosFile.templateBlank",
                    "Blank Eidos File"
                  )}
                </option>
                <option value="tasks">
                  {t(
                    "space.settings.fileSpace.eidosFile.templateTasks",
                    "Task tracker"
                  )}
                </option>
              </select>
            </SettingsRowControl>
          </SettingsRow>

          <SettingsRow>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <SettingsRowContent>
                <Label htmlFor="file-space-eidos-file-assets">
                  {t(
                    "space.settings.fileSpace.eidosFile.assetFolder",
                    "Imported files"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.eidosFile.assetFolderDescription",
                    "Choose where files added to Eidos File records are copied inside this Space. Stored values remain relative file paths."
                  )}
                </p>
              </SettingsRowContent>
            </div>
            <SettingsRowControl>
              <select
                id="file-space-eidos-file-assets"
                aria-label={t(
                  "space.settings.fileSpace.eidosFile.assetFolder",
                  "Imported files"
                )}
                className="h-8 w-full min-w-40 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring sm:w-auto"
                value={eidosFileAssetFolder}
                onChange={(event) =>
                  updateSettings(spaceId, {
                    eidosFileAssetFolder:
                      event.target.value === "eidos-file-folder-assets"
                        ? "eidos-file-folder-assets"
                        : "space-assets",
                  })
                }
              >
                <option value="space-assets">
                  {t(
                    "space.settings.fileSpace.eidosFile.assetFolderSpace",
                    "Space / assets"
                  )}
                </option>
                <option value="eidos-file-folder-assets">
                  {t(
                    "space.settings.fileSpace.eidosFile.assetFolderNearby",
                    "Next to Eidos File / assets"
                  )}
                </option>
              </select>
            </SettingsRowControl>
          </SettingsRow>
        </SettingsRows>
      </SettingsRowSurface>
    </SettingsSection>
  )
}
