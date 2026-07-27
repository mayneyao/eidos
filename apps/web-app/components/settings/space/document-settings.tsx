import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FileText,
  Type,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useSpaceSettings } from "@/hooks/use-space-settings"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDocPropertyTypes } from "@/apps/web-app/components/doc-property-global/property-type-hook"

export function DocumentSettings() {
  const { t } = useTranslation()
  const { customPropertyTypes, loading } = useDocPropertyTypes()

  const defaultSettings = {
    markerProperty: "",
    showReferenceNodeIcon: false,
    imageAlign: "center" as const,
  }
  const settings = useSpaceSettings("doc", defaultSettings)

  const updateSetting = async (key: string, value: string | boolean) => {
    const newSettings = {
      ...settings.data,
      [key]: value,
    }
    await settings.update(newSettings)
  }

  return (
    <div className="space-y-8">
      <SettingsSection>
        <SettingsSectionHeader
          icon={FileText}
          title={t("space.settings.documentProperties")}
        />
        <p className="mb-3 text-sm leading-5 text-muted-foreground">
          {t("space.settings.documentPropertiesDescription")}
        </p>
        <SettingsRowSurface>
          <SettingsRows>
            <SettingsRow>
              <SettingsRowContent>
                <Label htmlFor="markerProperty">
                  {t("space.settings.markerProperty")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("space.settings.markerPropertyDescription")}
                </p>
              </SettingsRowContent>
              <SettingsRowControl className="sm:w-64">
                <Select
                  value={settings.data.markerProperty || "none"}
                  onValueChange={(value) =>
                    updateSetting(
                      "markerProperty",
                      value === "none" ? "" : value
                    )
                  }
                >
                  <SelectTrigger id="markerProperty">
                    <SelectValue
                      placeholder={t("space.settings.selectProperty")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">
                        {t("common.none")}
                      </span>
                    </SelectItem>
                    {customPropertyTypes.map((property) => (
                      <SelectItem key={property.name} value={property.name}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRowControl>
            </SettingsRow>

            <SettingsRow>
              <SettingsRowContent>
                <Label htmlFor="showReferenceNodeIcon">
                  {t("space.settings.showReferenceNodeIcon")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("space.settings.showReferenceNodeIconDescription")}
                </p>
              </SettingsRowContent>
              <SettingsRowControl>
                <Switch
                  id="showReferenceNodeIcon"
                  checked={settings.data.showReferenceNodeIcon}
                  onCheckedChange={(checked) =>
                    updateSetting("showReferenceNodeIcon", checked)
                  }
                />
              </SettingsRowControl>
            </SettingsRow>
          </SettingsRows>
        </SettingsRowSurface>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          icon={Type}
          title={t("space.settings.imageSettings", "Image Settings")}
        />
        <SettingsRowSurface>
          <SettingsRow>
            <SettingsRowContent>
              <Label htmlFor="imageAlign">
                {t("space.settings.imageAlign")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("space.settings.imageAlignDescription")}
              </p>
            </SettingsRowContent>
            <SettingsRowControl>
              <ToggleGroup
                type="single"
                value={settings.data.imageAlign || "center"}
                onValueChange={(value) => {
                  if (value) {
                    updateSetting(
                      "imageAlign",
                      value as "left" | "center" | "right"
                    )
                  }
                }}
                className="w-fit gap-0 rounded-md border"
                size="sm"
              >
                <ToggleGroupItem
                  value="left"
                  aria-label={t("space.settings.imageAlignLeft")}
                  className="px-3"
                >
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="center"
                  aria-label={t("space.settings.imageAlignCenter")}
                  className="px-3"
                >
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="right"
                  aria-label={t("space.settings.imageAlignRight")}
                  className="px-3"
                >
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </SettingsRowControl>
          </SettingsRow>
        </SettingsRowSurface>
      </SettingsSection>
    </div>
  )
}
