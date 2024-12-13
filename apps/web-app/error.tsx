import { CopyIcon, RefreshCcw } from "lucide-react"
import { Link, useRouteError } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { DOMAINS } from "@/lib/const"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"

export function ErrorBoundary() {
  let error = useRouteError()
  const { toast } = useToast()
  const { t } = useTranslation()

  const handleCopyErrorMessages = () => {
    const messages = String((error as any).stack || error)
    if (messages) {
      navigator.clipboard.writeText(messages)
      toast({
        title: t("common.error.messagesCopied"),
      })
    }
  }

  const isStoragePermissionError =
    error instanceof DOMException &&
    error.message.includes(
      "not allowed by the user agent or the platform in the current context"
    )

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Toaster />
      <div className="flex flex-col items-center gap-2 container">
        <h1 className="text-lg font-bold">{t("common.error.somethingWentWrong")}</h1>
        {isStoragePermissionError ? (
          <>
            <p>
              {t("common.error.storagePermissionBlocked")}
            </p>
            <p>
              <Link to="/settings/storage">
                <Button size="xs">{t("settings.storage.grantPermission")}</Button>
                {t("common.error.willFixIssue")}
              </Link>
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-500">
              {error instanceof Error ? error.message : t("common.error.unknown")}
            </p>
            <Button onClick={() => window.location.reload()} size="xs">
              <RefreshCcw className="w-4 h-4 mr-2" />
              {t("common.error.reloadPage")}
            </Button>
          </div>
        )}

        <p>
          {t("common.error.tryAgainLater")}{" "}
          <Link
            to={DOMAINS.DISCORD_INVITE}
            target="_blank"
            className="text-blue-500"
          >
            discord
          </Link>{" "}
          {t("common.or")}{" "}
          <Link
            to={DOMAINS.GITHUB_ISSUES}
            target="_blank"
            className="text-blue-500"
          >
            {t("common.error.createIssue")}
          </Link>{" "}
          {t("common.error.forHelp")}{" "}
          <Button size="xs" variant="outline" onClick={handleCopyErrorMessages}>
            <CopyIcon className="w-4 h-4 mr-2" />
            {t("common.error.message")}
          </Button>{" "}
          {t("common.error.forBetterAssistance")}
        </p>
      </div>
    </div>
  )
}
