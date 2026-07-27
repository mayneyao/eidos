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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDocPropertyTypes } from "@/apps/web-app/components/doc-property-global/property-type-hook"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
      <SettingsSection
        title={t("space.settings.documentProperties")}
        description={t("space.settings.documentPropertiesDescription")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<FileText />}
            htmlFor="markerProperty"
            title={t("space.settings.markerProperty")}
            description={t("space.settings.markerPropertyDescription")}
            controlClassName="w-64 max-w-full"
          >
            <Select
              value={settings.data.markerProperty || "none"}
              onValueChange={(value) =>
                updateSetting("markerProperty", value === "none" ? "" : value)
              }
            >
              <SelectTrigger id="markerProperty">
                <SelectValue placeholder={t("space.settings.selectProperty")} />
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
          </SettingsRow>
          <SettingsRow
            htmlFor="showReferenceNodeIcon"
            title={t("space.settings.showReferenceNodeIcon")}
            description={t("space.settings.showReferenceNodeIconDescription")}
          >
            <Switch
              id="showReferenceNodeIcon"
              checked={settings.data.showReferenceNodeIcon}
              onCheckedChange={(checked) =>
                updateSetting("showReferenceNodeIcon", checked)
              }
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection
        title={t("space.settings.imageSettings", "Image Settings")}
      >
        <SettingsRows>
          <SettingsRow
            icon={<Type />}
            htmlFor="imageAlign"
            title={t("space.settings.imageAlign")}
            description={t("space.settings.imageAlignDescription")}
          >
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
              className="border rounded-md gap-0"
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
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
