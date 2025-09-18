import { useTranslation } from "react-i18next"

import { useSpaceSettings } from "@/hooks/use-space-settings"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDocPropertyTypes } from "@/apps/web-app/components/doc-property-global/property-type-hook"

export function DocumentSettings() {
  const { t } = useTranslation()
  const { customPropertyTypes, loading } = useDocPropertyTypes()

  // Initialize space settings with default values
  const defaultSettings = {
    markerProperty: "",
    showReferenceNodeIcon: false,
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
    <div className="space-y-0">
      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-medium mb-1">
              {t("space.settings.documentProperties")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.documentPropertiesDescription")}
            </p>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="markerProperty">
                    {t("space.settings.markerProperty")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.markerPropertyDescription")}
                  </p>
                </div>
                <div className="w-64">
                  <Select
                    value={settings.data.markerProperty || "none"}
                    onValueChange={(value) =>
                      updateSetting(
                        "markerProperty",
                        value === "none" ? "" : value
                      )
                    }
                  >
                    <SelectTrigger>
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
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="showReferenceNodeIcon">
                    {t("space.settings.showReferenceNodeIcon")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.showReferenceNodeIconDescription")}
                  </p>
                </div>
                <div className="w-64 flex justify-end">
                  <Switch
                    checked={settings.data.showReferenceNodeIcon}
                    onCheckedChange={(checked) =>
                      updateSetting("showReferenceNodeIcon", checked)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
