import { useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { useTranslation } from "react-i18next"
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useExtension } from "@/apps/web-app/hooks/use-extension"

export const DangerZone = () => {
  const script = useLoaderData() as IExtension
  const revalidator = useRevalidator()
  const { toast } = useToast()
  const { deleteExtension } = useExtension()
  const { t } = useTranslation()
  const router = useNavigate()
  const { space } = useCurrentPathInfo()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleDeleteExtension = async () => {
    try {
      await deleteExtension(script.id)
      setShowDeleteDialog(false)
      router(`/${space}/extensions`)
    } catch (error) {
      toast({
        title: "Failed to delete script",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">
          {t("extension.config.dangerZone")}
        </CardTitle>
        <CardDescription>
          {t("extension.config.dangerZoneDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="flex flex-col">
          <p className="font-medium">
            {t("extension.config.deleteExtension")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("extension.config.deleteExtensionDescription")}
          </p>
        </div>
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              {t("extension.config.deleteExtensionButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("extension.toolbar.deleteConfirmTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("extension.toolbar.deleteConfirmDescription", {
                  name: script.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDeleteExtension}>
                {t("common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}