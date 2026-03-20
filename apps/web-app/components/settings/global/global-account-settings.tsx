import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  User,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  ExternalLink,
  LogOut,
  LogIn,
  CheckCircle2,
} from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useAuthOptional } from "@/components/auth-provider"
import { useActivation } from "@/hooks/use-activation"

export function GlobalAccountSettings() {
  const { t } = useTranslation()
  const auth = useAuthOptional()
  const { license, activate, isLoading: activationLoading } = useActivation()
  const [licenseKey, setLicenseKey] = useState("")
  const [loading, setLoading] = useState(false)

  const handleActivate = async () => {
    if (!licenseKey) return
    setLoading(true)
    try {
      await activate(licenseKey, auth?.accessToken ?? undefined)
      setLicenseKey("")
    } finally {
      setLoading(false)
    }
  }

  const isAuthenticated = auth?.isAuthenticated ?? false
  const user = auth?.user

  return (
    <div className="space-y-0">
      {/* Account Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.account.title", "Account")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          {/* User Info Card */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-center gap-4">
              {isAuthenticated && user ? (
                <>
                  <Avatar className="h-14 w-14 shrink-0">
                    <AvatarImage src={user?.picture} />
                    <AvatarFallback className="text-base">
                      {user?.name?.[0] || user?.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user?.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user?.email}
                    </p>
                    <Badge
                      variant="secondary"
                      className="mt-2 text-green-600 bg-green-50 dark:bg-green-950/30"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t("settings.account.loggedIn", "Logged in")}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => auth?.logout()}
                    className="shrink-0"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("settings.account.logout", "Log out")}
                  </Button>
                </>
              ) : (
                <>
                  <Avatar className="h-14 w-14 shrink-0">
                    <AvatarFallback className="bg-muted">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {t("settings.account.notLoggedIn", "Not logged in")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "settings.account.loginDescription",
                        "Login to use sync and share extensions"
                      )}
                    </p>
                    {!isDesktopMode && (
                      <p className="text-xs text-amber-600 mt-2">
                        {t(
                          "settings.account.desktopOnly",
                          "Only available in desktop app"
                        )}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => auth?.login()}
                    disabled={!isDesktopMode}
                    className="shrink-0"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    {t("settings.account.login", "Login")}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Services Info */}
          <div className="p-4 rounded-lg bg-muted/50 border">
            <p className="font-medium mb-3">
              {t("settings.account.services", "Services that require login:")}
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {t(
                  "settings.account.serviceExtensionShare",
                  "Share extension to eidos.space"
                )}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {t("settings.account.serviceSync", "Sync")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {t("settings.account.serviceRelay", "Relay")}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* License Management Section */}
      {isDesktopMode && (
        <>
          <div className="py-4">
            <h3 className="text-lg font-medium">
              {t("settings.license.title", "License Management")}
            </h3>
          </div>

          <hr className="border-border" />

          <div className="py-6">
            <div className="space-y-6">
              {/* Description */}
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.license.description",
                  "Enter your license key to activate Spark features on this device."
                )}
              </p>

              {/* Loading State */}
              {activationLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("settings.license.loading", "Checking license status...")}
                </div>
              ) : license ? (
                /* Active License Card */
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 shrink-0">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-green-600 bg-green-50 dark:bg-green-950/30 uppercase"
                          >
                            {license.plan}
                          </Badge>
                          <span className="text-sm font-mono text-muted-foreground">
                            {license.licenseKey.slice(0, 4) +
                              "*".repeat(license.licenseKey.length - 8) +
                              license.licenseKey.slice(-4)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {license.expiresAt
                            ? `${t("settings.license.expiresAt", "Expires at: ")}${new Date(license.expiresAt).toLocaleDateString()}`
                            : t(
                                "settings.license.lifetime",
                                "Lifetime license"
                              )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* No License - Activation Form */
                <div className="space-y-4">
                  {/* Login Required Warning */}
                  {!isAuthenticated && (
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            {t(
                              "settings.account.loginRequired",
                              "Login Required"
                            )}
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            {t(
                              "settings.license.loginRequired",
                              "Please login to your account above before activating your license."
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* License Input */}
                  <div className="space-y-2">
                    <Label htmlFor="license-key">
                      {t("settings.license.licenseKey", "License Key")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="license-key"
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        value={licenseKey}
                        onChange={(e) =>
                          setLicenseKey(e.target.value.toUpperCase())
                        }
                        className="font-mono"
                        disabled={loading || !isAuthenticated}
                      />
                      <Button
                        onClick={handleActivate}
                        disabled={loading || !licenseKey || !isAuthenticated}
                      >
                        {loading && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("settings.license.activate", "Activate")}
                      </Button>
                    </div>
                  </div>

                  {/* Buy Link */}
                  <p className="text-sm text-muted-foreground">
                    {t("settings.license.buyHint", "Don't have a license? ")}
                    <a
                      href="https://eidos.space/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-primary hover:underline"
                    >
                      {t("settings.license.buyLink", "Get one here")}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
