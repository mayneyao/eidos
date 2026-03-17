import { AlignCenter, AlignLeft, AlignRight } from "lucide-react"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDocPropertyTypes } from "@/apps/web-app/components/doc-property-global/property-type-hook"

export function DocumentSettings() {
  const { t } = useTranslation()
  const { customPropertyTypes, loading } = useDocPropertyTypes()

  // Initialize space settings with default values
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
    <div className="space-y-0">
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("space.settings.documentProperties")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.documentPropertiesDescription")}
            </p>
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-0.5 flex-[5] min-w-[240px]">
                  <Label htmlFor="markerProperty">
                    {t("space.settings.markerProperty")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.markerPropertyDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-64">
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
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-0.5 flex-[5] min-w-[240px]">
                  <Label htmlFor="showReferenceNodeIcon">
                    {t("space.settings.showReferenceNodeIcon")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.showReferenceNodeIconDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-64 flex justify-end shrink-0">
                  <Switch
                    checked={settings.data.showReferenceNodeIcon}
                    onCheckedChange={(checked) =>
                      updateSetting("showReferenceNodeIcon", checked)
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-0.5 flex-[5] min-w-[240px]">
                  <Label htmlFor="imageAlign">
                    {t("space.settings.imageAlign")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.imageAlignDescription")}
                  </p>
                </div>
                <div className="w-full lg:w-64 flex justify-end shrink-0">
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
                    className="justify-end  border rounded-sm gap-0"
                    size="sm"
                  >
                    <ToggleGroupItem
                      value="left"
                      aria-label={t("space.settings.imageAlignLeft")}
                    >
                      <AlignLeft className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="center"
                      aria-label={t("space.settings.imageAlignCenter")}
                    >
                      <AlignCenter className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="right"
                      aria-label={t("space.settings.imageAlignRight")}
                    >
                      <AlignRight className="h-4 w-4" />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
