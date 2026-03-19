import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FileText,
  Type,
} from "lucide-react"
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
      {/* Document Properties Section */}
      <div className="py-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">
          {t("space.settings.documentProperties")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t("space.settings.documentPropertiesDescription")}
          </p>

          {/* Marker Property */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <Label htmlFor="markerProperty">
                {t("space.settings.markerProperty")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("space.settings.markerPropertyDescription")}
              </p>
            </div>
            <div className="w-full lg:w-64 shrink-0">
              <Select
                value={settings.data.markerProperty || "none"}
                onValueChange={(value) =>
                  updateSetting("markerProperty", value === "none" ? "" : value)
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
            </div>
          </div>

          {/* Show Reference Node Icon */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <Label htmlFor="showReferenceNodeIcon">
                {t("space.settings.showReferenceNodeIcon")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("space.settings.showReferenceNodeIconDescription")}
              </p>
            </div>
            <Switch
              id="showReferenceNodeIcon"
              checked={settings.data.showReferenceNodeIcon}
              onCheckedChange={(checked) =>
                updateSetting("showReferenceNodeIcon", checked)
              }
            />
          </div>
        </div>
      </div>

      {/* Image Settings Section */}
      <div className="py-4 flex items-center gap-2">
        <Type className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">
          {t("space.settings.imageSettings", "Image Settings")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1 min-w-0">
            <Label htmlFor="imageAlign">{t("space.settings.imageAlign")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("space.settings.imageAlignDescription")}
            </p>
          </div>
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
            className="border rounded-md gap-0 shrink-0"
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
        </div>
      </div>
    </div>
  )
}
