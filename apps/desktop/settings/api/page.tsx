import { useTranslation } from "react-i18next"

import { Separator } from "@/components/ui/separator"

import { ApiForm } from "./api-form"

export default function SettingsApiPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("settings.api")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.api.description")}
        </p>
      </div>
      <Separator />
      <ApiForm />
    </div>
  )
}
