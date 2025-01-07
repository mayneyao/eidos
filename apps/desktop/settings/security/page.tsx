"use client"

import { useTranslation } from "react-i18next"

import { Separator } from "@/components/ui/separator"
import { SecurityForm } from "./security-form"

export default function SettingsSecurityPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("settings.security")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.security.description")}
        </p>
      </div>
      <Separator />
      <SecurityForm />
    </div>
  )
} 