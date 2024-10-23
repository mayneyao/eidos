import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"
import { ProfileForm } from "@/apps/web-app/settings/profile-form"

export default function SettingsGeneralPage() {
  const { t } = useTranslation()

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("settings.general")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.general.description")}
        </p>
      </div>
      <Separator />
      <ProfileForm />
    </div>
  )
}
