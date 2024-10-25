import { Separator } from "@/components/ui/separator"
import { useTranslation } from "react-i18next"

import { StorageForm } from "./storage-form"

export default function SettingsStoragePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("settings.storage")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.storage.description")}
        </p>
      </div>
      <Separator />
      <StorageForm />
    </div>
  )
}
