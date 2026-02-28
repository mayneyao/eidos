import { User } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthOptional } from "@/components/auth-provider"
import { useActivation } from "@/hooks/use-activation"
import { useState, useEffect } from "react"
import {
  ShieldCheck,
  CreditCard,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

export function GlobalAccountSettings() {
  const { t } = useTranslation()
  const auth = useAuthOptional()
  const {
    license,
    activate,
    refresh,
    isLoading: activationLoading,
  } = useActivation()
  const [licenseKey, setLicenseKey] = useState("")
  const [loading, setLoading] = useState(false)

  // Use license from useActivation hook
  const licenseInfo = license
  const initialLoading = activationLoading

  const handleActivate = async () => {
    if (!licenseKey) return
    setLoading(true)
    try {
      const success = await activate(licenseKey, auth?.accessToken)
      if (success) {
        setLicenseKey("")
      }
    } finally {
      setLoading(false)
    }
  }

  const isAuthenticated = auth?.isAuthenticated ?? false
  const user = auth?.user

  return (
    <div className="space-y-6">
      {/* User Info Card */}
      <div className="flex items-center gap-4">
        {isAuthenticated && user ? (
          <>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.picture} />
              <AvatarFallback className="text-lg">
                {user?.name?.[0] || user?.email?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-medium truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <Button variant="outline" onClick={() => auth?.logout()}>
              {t("settings.account.logout", "Log out")}
            </Button>
          </>
        ) : (
          <>
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">
                <User className="h-8 w-8 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-lg font-medium">
                {t("settings.account.notLoggedIn", "Not logged in")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.account.loginDescription",
                  "Login to use sync and share extensions"
                )}
              </p>
            </div>
            <Button onClick={() => auth?.login()} disabled={!isDesktopMode}>
              {t("settings.account.login", "Login")}
            </Button>
          </>
        )}
      </div>

      {/* Desktop Only Warning */}
      {!isDesktopMode && (
        <p className="text-sm text-orange-600">
          {t(
            "settings.account.desktopOnly",
            "Account login is only available in the desktop application."
          )}
        </p>
      )}

      {/* Services Info */}
      <div className="p-4 rounded-lg bg-muted/50 border text-sm">
        <p className="font-medium mb-2">
          {t("settings.account.services", "Services that require login:")}
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            {t(
              "settings.account.serviceExtensionShare",
              "Share extension to eidos.space"
            )}
          </li>
          <li>{t("settings.account.serviceSync", "Sync")}</li>
        </ul>
      </div>

      {/* License Management Section */}
      {isDesktopMode && (
        <div className="space-y-4 pt-6 border-t">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">
              {t("settings.license.title", "License Management")}
            </h3>
          </div>

          {initialLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t("settings.license.loading", "Checking license status...")}
            </div>
          ) : licenseInfo ? (
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold uppercase text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {licenseInfo.plan}
                    </span>
                    <span className="text-sm font-medium font-mono">
                      {licenseInfo.licenseKey.slice(0, 4) +
                        "*".repeat(licenseInfo.licenseKey.length - 8) +
                        licenseInfo.licenseKey.slice(-4)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {licenseInfo.expiresAt
                      ? `${t("settings.license.expiresAt", "Expires at: ")}${new Date(licenseInfo.expiresAt).toLocaleDateString()}`
                      : t("settings.license.lifetime", "Lifetime license")}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.license.description",
                  "Enter your license key to activate Spark features on this device."
                )}
              </p>
              {!isAuthenticated && (
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-start gap-3 text-orange-800 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    {t(
                      "settings.license.loginRequired",
                      "Please login to your account above before activating your license."
                    )}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  className="font-mono"
                  disabled={loading || !isAuthenticated}
                />
                <Button
                  onClick={handleActivate}
                  disabled={loading || !licenseKey || !isAuthenticated}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("settings.license.activate", "Activate")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground italic">
                {t("settings.license.buyHint", "Don't have a license? ")}
                <a
                  href="https://eidos.space/pricing"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {t("settings.license.buyLink", "Get one here")}
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
