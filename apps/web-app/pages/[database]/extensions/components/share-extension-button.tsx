import { useCallback, useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { Share2 } from "lucide-react"
import { useTranslation } from "react-i18next"

// import { authClient } from "@/lib/auth-client"
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
// TODO: Import a store or context to get the API key
// Example: import { useApiKeyStore } from "@/stores/api-key-store";
import { useConfigStore } from "@/apps/web-app/pages/settings/store"

// import { LoginDialog } from "@/components/login-dialog"

import { useExtensionMarketplace } from "../hooks/use-extension-marketplace"

// Import the config store

interface ShareExtensionButtonProps {
  script: IExtension
  onSuccess: () => void
  // apiKey?: string; // Or get it from a store
}

export const ShareExtensionButton = ({
  script,
  onSuccess,
}: ShareExtensionButtonProps) => {
  const { t } = useTranslation()

  const publishingApiKey = useConfigStore((state) => state.extensionsManagerKey) // Use the single publishingApiKey

  const { isSubmitting, submitExtension, isPublishing, publishNewVersion } =
    useExtensionMarketplace({
      script,
      editorContent: script.ts_code || script.code,
      apiKey: publishingApiKey, // Pass the publishingApiKey to the hook
    })
  // const { data: session, refetch } = authClient.useSession()
  // const user = session?.user
  // const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  // const [loginFromShare, setLoginFromShare] = useState(false)

  const handleSubmitOrPublish = useCallback(async () => {
    if (!publishingApiKey) {
      // This case is now handled by the handleConfirmClick redirecting to settings
      // The hook will also show a toast if an attempt is made without a key.
      return
    }
    if (script.marketplace_id) {
      await publishNewVersion()
    } else {
      await submitExtension()
    }
    onSuccess()
    setShareDialogOpen(false)
  }, [script, publishingApiKey, publishNewVersion, submitExtension, onSuccess])

  const handleConfirmClick = useCallback(() => {
    if (!publishingApiKey) {
      // Navigate to API key settings page
      window.location.href = "/settings/api-key"
      setShareDialogOpen(false)
      return
    }
    handleSubmitOrPublish()
  }, [handleSubmitOrPublish, publishingApiKey])

  // const handleLoginSuccess = useCallback(() => {
  //   refetch()
  //   if (loginFromShare) {
  //     setLoginFromShare(false)
  //     setShareDialogOpen(true)
  //   }
  // }, [refetch, loginFromShare])

  const getDialogDescription = () => {
    if (!publishingApiKey) {
      return "An API key is required to share extensions. Please configure it in the API Key Management section of Settings."
    }
    if (script.marketplace_id) {
      return "This action will update the existing public extension listing with the current code and metadata. Are you sure you want to proceed?"
    }
    return "This action will submit the current code as a new public extension to the marketplace. Are you sure you want to proceed?"
  }

  const getConfirmButtonText = () => {
    if (isSubmitting || isPublishing) {
      return "Submitting..."
    }
    if (!publishingApiKey) {
      return "Go to Settings"
    }
    return script.marketplace_id ? "Confirm & Publish" : "Confirm & Submit"
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
              disabled={(isSubmitting || isPublishing) && !!publishingApiKey} // Disable only if submitting/publishing WITH an API key
            >
              {getConfirmButtonText()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* <LoginDialog
        open={isLoginDialogOpen}
        onOpenChange={setIsLoginDialogOpen}
        onSuccess={handleLoginSuccess}
      /> */}
    </>
  )
}
