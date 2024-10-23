import { useTranslation } from "react-i18next"
import { Separator } from "@/components/ui/separator"
import { AIConfigForm } from "./ai-form"

export default function SettingsAIPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("settings.ai")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.description")}
        </p>
      </div>
      <Separator />
      <AIConfigForm />
    </div>
  )
}
