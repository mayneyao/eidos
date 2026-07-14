import { FolderOpen, LayoutTemplate } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
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

  const defaultBaseTemplate = settings?.defaultBaseTemplate ?? "blank"
  const baseAssetFolder = settings?.baseAssetFolder ?? "space-assets"

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      <div className="pb-2">
        <h3>{t("space.settings.fileSpace.base.group", "Defaults")}</h3>
      </div>
      <hr />
      <div>
        <div className="divide-y divide-border/70">
          <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex min-w-[240px] flex-1 items-start gap-3">
              <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="file-space-base-template">
                  {t(
                    "space.settings.fileSpace.base.defaultTemplate",
                    "Default template"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.base.defaultTemplateDescription",
                    "Preselect a starting point when creating a Base. You can still choose another template before creation."
                  )}
                </p>
              </div>
            </div>
            <select
              id="file-space-base-template"
              aria-label={t(
                "space.settings.fileSpace.base.defaultTemplate",
                "Default template"
              )}
              className="h-8 min-w-40 shrink-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              value={defaultBaseTemplate}
              onChange={(event) =>
                updateSettings(spaceId, {
                  defaultBaseTemplate:
                    event.target.value === "tasks" ? "tasks" : "blank",
                })
              }
            >
              <option value="blank">
                {t("space.settings.fileSpace.base.templateBlank", "Blank Base")}
              </option>
              <option value="tasks">
                {t(
                  "space.settings.fileSpace.base.templateTasks",
                  "Task tracker"
                )}
              </option>
            </select>
          </div>

          <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex min-w-[240px] flex-1 items-start gap-3">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="file-space-base-assets">
                  {t(
                    "space.settings.fileSpace.base.assetFolder",
                    "Imported files"
                  )}
                </Label>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t(
                    "space.settings.fileSpace.base.assetFolderDescription",
                    "Choose where files added to Base records are copied inside this Space. Stored values remain relative file paths."
                  )}
                </p>
              </div>
            </div>
            <select
              id="file-space-base-assets"
              aria-label={t(
                "space.settings.fileSpace.base.assetFolder",
                "Imported files"
              )}
              className="h-8 min-w-40 shrink-0 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              value={baseAssetFolder}
              onChange={(event) =>
                updateSettings(spaceId, {
                  baseAssetFolder:
                    event.target.value === "base-folder-assets"
                      ? "base-folder-assets"
                      : "space-assets",
                })
              }
            >
              <option value="space-assets">
                {t(
                  "space.settings.fileSpace.base.assetFolderSpace",
                  "Space / assets"
                )}
              </option>
              <option value="base-folder-assets">
                {t(
                  "space.settings.fileSpace.base.assetFolderNearby",
                  "Next to Base / assets"
                )}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
