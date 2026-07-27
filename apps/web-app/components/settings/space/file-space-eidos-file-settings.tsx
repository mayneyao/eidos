import { FolderOpen, LayoutTemplate } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.fileSpace.eidosFile.group", "Defaults")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<LayoutTemplate />}
            htmlFor="file-space-eidos-file-template"
            title={t(
              "space.settings.fileSpace.eidosFile.defaultTemplate",
              "Default template"
            )}
            description={t(
              "space.settings.fileSpace.eidosFile.defaultTemplateDescription",
              "Preselect a starting point when creating an Eidos File. You can still choose another template before creation."
            )}
          >
            <select
              id="file-space-eidos-file-template"
              aria-label={t(
                "space.settings.fileSpace.eidosFile.defaultTemplate",
                "Default template"
              )}
              className="h-8 min-w-40 shrink-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
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
          </SettingsRow>
          <SettingsRow
            icon={<FolderOpen />}
            htmlFor="file-space-eidos-file-assets"
            title={t(
              "space.settings.fileSpace.eidosFile.assetFolder",
              "Imported files"
            )}
            description={t(
              "space.settings.fileSpace.eidosFile.assetFolderDescription",
              "Choose where files added to Eidos File records are copied inside this Space. Stored values remain relative file paths."
            )}
          >
            <select
              id="file-space-eidos-file-assets"
              aria-label={t(
                "space.settings.fileSpace.eidosFile.assetFolder",
                "Imported files"
              )}
              className="h-8 min-w-40 shrink-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
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
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
