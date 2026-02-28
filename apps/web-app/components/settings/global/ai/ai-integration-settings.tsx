import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAIConfigStore } from "../../stores/ai-config-store"

export function AIIntegrationSettings() {
  const { t } = useTranslation()
  const { aiConfig, updateTelegramIntegration } = useAIConfigStore()

  const [telegramEnabled, setTelegramEnabled] = useState(
    aiConfig.integrations?.telegram?.enabled || false
  )
  const [telegramBotToken, setTelegramBotToken] = useState(
    aiConfig.integrations?.telegram?.botToken || ""
  )

  const handleSaveTelegram = () => {
    updateTelegramIntegration({
      enabled: telegramEnabled,
      botToken: telegramBotToken,
    })
  }

  return (
    <div className="space-y-0">
      {/* Telegram Section */}
      <div className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-lg font-medium">
              {t("settings.ai.telegramBot")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.ai.telegramBotDescription")}
            </p>
          </div>
          <Switch
            checked={telegramEnabled}
            onCheckedChange={setTelegramEnabled}
          />
        </div>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="telegram-token">
              {t("settings.ai.botToken")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="telegram-token"
                type="password"
                placeholder={t("settings.ai.botTokenPlaceholder")}
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                disabled={!telegramEnabled}
                className="flex-1"
              />
              <Button
                onClick={handleSaveTelegram}
                disabled={!telegramEnabled}
              >
                {t("settings.ai.saveConfig")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.ai.botTokenHint")}{" "}
              <a
                href="https://t.me/botfather"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                @BotFather
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="py-4">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 {t("settings.ai.integrationHint1")}</p>
          <p>🤖 {t("settings.ai.integrationHint2")}</p>
          <p>⌨️ {t("settings.ai.integrationHint3")}</p>
        </div>
      </div>
    </div>
  )
}
