import { User } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuthOptional } from "@/components/auth-provider"

export function GlobalAccountSettings() {
  const { t } = useTranslation()
  const auth = useAuthOptional()

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
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
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
    </div>
  )
}
