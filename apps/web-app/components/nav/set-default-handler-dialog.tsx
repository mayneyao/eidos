"use client"

import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTranslation } from "react-i18next"

interface SetDefaultHandlerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentHandler: IExtension<FileHandlerMeta> | null
  defaultHandler: IExtension<FileHandlerMeta> | null
  fileExtension: string
  onConfirm: () => void
}

/**
 * Dialog component for setting a file handler as default
 */
export const SetDefaultHandlerDialog = ({
  open,
  onOpenChange,
  currentHandler,
  defaultHandler,
  fileExtension,
  onConfirm,
}: SetDefaultHandlerDialogProps) => {
  const { t } = useTranslation()

  const getHandlerName = (handler: IExtension<FileHandlerMeta> | null) => {
    if (!handler) return ""
    const meta = handler.meta as FileHandlerMeta
    return meta.fileHandler?.title || handler.name || handler.id
  }

  const getHandlerDescription = (
    handler: IExtension<FileHandlerMeta> | null
  ) => {
    if (!handler) return ""
    const meta = handler.meta as FileHandlerMeta
    return meta.fileHandler?.description || ""
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("file.handler.setAsDefaultTitle", "Set as Default Handler")}
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <div>
              <p className="font-medium mb-1">
                {t("file.handler.currentHandler", "Current Handler:")}
              </p>
              <div className="pl-2">
                <p className="text-foreground">
                  {currentHandler && (
                    <>
                      {currentHandler.meta?.fileHandler?.icon && (
                        <span className="mr-2">
                          {currentHandler.meta.fileHandler.icon}
                        </span>
                      )}
                      <strong>{getHandlerName(currentHandler)}</strong>
                    </>
                  )}
                </p>
                {currentHandler && getHandlerDescription(currentHandler) && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {getHandlerDescription(currentHandler)}
                  </p>
                )}
              </div>
            </div>
            {defaultHandler && (
              <div>
                <p className="font-medium mb-1">
                  {t("file.handler.currentDefault", "Current Default Handler:")}
                </p>
                <div className="pl-2">
                  <p className="text-foreground">
                    {defaultHandler.meta?.fileHandler?.icon && (
                      <span className="mr-2">
                        {defaultHandler.meta.fileHandler.icon}
                      </span>
                    )}
                    <strong>{getHandlerName(defaultHandler)}</strong>
                  </p>
                  {getHandlerDescription(defaultHandler) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {getHandlerDescription(defaultHandler)}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="pt-2 border-t">
              <p className="text-sm">
                {t(
                  "file.handler.setAsDefaultDescription",
                  "This will set the current handler as the default handler for {extension} files. All future {extension} files will open with this handler automatically.",
                  { extension: fileExtension }
                )}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={onConfirm}>
            {t("file.handler.confirmSetAsDefault", "Set as Default")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
