import { useState, useEffect } from "react"
import { Link2, Globe, Shield, Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { FileProperty } from "@/packages/core/fields/file"
import type { IField } from "@/packages/core/types/IField"
import { EIDOS_PROXY_URL } from "@/lib/const"
import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface IFieldPropertyEditorProps {
  uiColumn: IField<FileProperty>
  onPropertyChange: (property: FileProperty) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const FilePropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()

  // Proxy settings are not needed in desktop mode
  if (isDesktopMode) {
    return null
  }

  const [proxyUrl, setProxyUrl] = useState<string>(
    props.uiColumn.property?.proxyUrl ?? EIDOS_PROXY_URL ?? ""
  )

  // Sync with external changes
  useEffect(() => {
    setProxyUrl(props.uiColumn.property?.proxyUrl ?? EIDOS_PROXY_URL ?? "")
  }, [props.uiColumn.property?.proxyUrl])

  const handleUpdate = () => {
    props.onPropertyChange({
      proxyUrl: proxyUrl.trim() || undefined,
    })
    props.onSave?.()
  }

  const isValidUrl = (url: string) => {
    if (!url) return true
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const validationError = !isValidUrl(proxyUrl)

  return (
    <div className="space-y-3">
      <Separator />

      {/* Header */}
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.file.proxySettings")}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-xs">
              {t("table.propertyEditor.file.proxyTooltip")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Proxy URL Input */}
      <div className="space-y-1.5">
        <Label
          htmlFor="proxyUrl"
          className="text-xs font-medium text-foreground"
        >
          {t("table.propertyEditor.file.proxyUrl")}
        </Label>
        <div className="relative">
          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            id="proxyUrl"
            type="text"
            placeholder={EIDOS_PROXY_URL || "https://proxy.example.com/"}
            className={cn(
              "h-8 text-xs pl-8",
              validationError &&
                "border-destructive focus-visible:ring-destructive"
            )}
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !validationError) {
                handleUpdate()
              }
            }}
          />
        </div>
        {validationError ? (
          <p className="text-[11px] text-destructive">
            {t("table.propertyEditor.file.invalidUrl")}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t("table.propertyEditor.file.proxyDescription")}
          </p>
        )}
      </div>

      {/* Security Note */}
      <div
        className={cn(
          "flex items-start gap-1.5 rounded-md border p-2 text-[11px]",
          "bg-muted/50 border-border"
        )}
      >
        <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <span className="text-muted-foreground leading-relaxed">
          {t("table.propertyEditor.file.securityNote")}
        </span>
      </div>

      {/* Save Button - only show if not auto-saving */}
      {props.onSave && (
        <Button
          onClick={handleUpdate}
          disabled={validationError}
          className="h-7 text-xs w-full"
          size="sm"
        >
          {t("common.save")}
        </Button>
      )}
    </div>
  )
}
