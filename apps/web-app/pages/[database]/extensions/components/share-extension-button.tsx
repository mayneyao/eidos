import { useCallback, useEffect, useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { Share2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useAuthOptional } from "@/components/auth-provider"
import { useSettings } from "@/apps/web-app/hooks/use-settings"

import { useExtensionMarketplace } from "../hooks/use-extension-marketplace"

interface ShareExtensionButtonProps {
  script: IExtension
  onSuccess: () => void
  autoOpen?: boolean
  onAutoOpen?: () => void
}

export const ShareExtensionButton = ({
  script,
  onSuccess,
  autoOpen = false,
  onAutoOpen,
}: ShareExtensionButtonProps) => {
  const { t } = useTranslation()
  const auth = useAuthOptional()
  const { openSettingsModal } = useSettings()

  const {
    isSubmitting,
    submitExtension,
    isPublishing,
    publishNewVersion,
    hasAuth,
  } = useExtensionMarketplace({
    script,
    editorContent: script.ts_code || script.code,
    accessToken: auth?.accessToken,
  })
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // Auto-open share dialog when requested (e.g., from context menu navigation)
  useEffect(() => {
    if (autoOpen && !shareDialogOpen) {
      setShareDialogOpen(true)
      onAutoOpen?.()
    }
  }, [autoOpen, shareDialogOpen, onAutoOpen])

  const handleSubmitOrPublish = useCallback(async () => {
    if (!hasAuth) {
      // This case is now handled by the handleConfirmClick redirecting to login
      return
    }
    if (script.marketplace_id) {
      await publishNewVersion()
    } else {
      await submitExtension()
    }
    onSuccess()
    setShareDialogOpen(false)
  }, [script, hasAuth, publishNewVersion, submitExtension, onSuccess])

  const handleConfirmClick = useCallback(() => {
    if (!hasAuth) {
      // Redirect to login via settings
      openSettingsModal("general")
      setShareDialogOpen(false)
      return
    }
    handleSubmitOrPublish()
  }, [handleSubmitOrPublish, hasAuth, openSettingsModal])

  const getDialogDescription = () => {
    if (!hasAuth) {
      return t(
        "extensions.share.loginRequired",
        "Login is required to share extensions. Please login in the General section of Settings."
      )
    }
    if (script.marketplace_id) {
      return t(
        "extensions.share.updateDescription",
        "This action will update the existing public extension listing with the current code and metadata. Are you sure you want to proceed?"
      )
    }
    return t(
      "extensions.share.submitDescription",
      "This action will submit the current code as a new public extension to the marketplace. Are you sure you want to proceed?"
    )
  }

  const getConfirmButtonText = () => {
    if (isSubmitting || isPublishing) {
      return t("extensions.share.submitting", "Submitting...")
    }
    if (!hasAuth) {
      return t("extensions.share.goToSettings", "Go to Settings")
    }
    return script.marketplace_id
      ? t("extensions.share.confirmPublish", "Confirm & Publish")
      : t("extensions.share.confirmSubmit", "Confirm & Submit")
  }

  if (!["block", "udf", "script"].includes(script.type)) {
    return null
  }

  return (
    <>
      <AlertDialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title="Share Extension"
            // disabled={!publishingApiKey && !(isSubmitting || isPublishing)} // Enable button, dialog will guide user
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share this Extension?</AlertDialogTitle>
            <AlertDialogDescription>
              {getDialogDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting || isPublishing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClick}
              disabled={(isSubmitting || isPublishing) && hasAuth} // Disable only if submitting/publishing WITH auth
            >
              {getConfirmButtonText()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
