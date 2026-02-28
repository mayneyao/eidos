import { useState } from "react"
import type {
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

interface HandlerSelectorProps {
  open: boolean
  onClose: () => void
  handlers: IExtension<FileHandlerMeta>[]
  fileExtension: string
  fileName: string
  onSelect: (handlerId: string, remember: boolean) => void
}

export function HandlerSelector({
  open,
  onClose,
  handlers,
  fileExtension,
  fileName,
  onSelect,
}: HandlerSelectorProps) {
  const [selectedHandlerId, setSelectedHandlerId] = useState<string>("")
  const [rememberChoice, setRememberChoice] = useState(false)

  const handleConfirm = () => {
    if (selectedHandlerId) {
      onSelect(selectedHandlerId, rememberChoice)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an application to open this file</DialogTitle>
          <DialogDescription>
            Select an application to open "{fileName}" ({fileExtension})
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-2">
            {handlers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No file handlers available for {fileExtension} files.
              </div>
            ) : (
              handlers.map((handler) => {
                const meta = handler.meta as FileHandlerMeta
                const isSelected = selectedHandlerId === handler.id

                return (
                  <Card
                    key={handler.id}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => setSelectedHandlerId(handler.id)}
                  >
                    <CardHeader className="py-3">
                      <div className="flex items-start gap-3">
                        {meta.fileHandler.icon && (
                          <div className="text-2xl">
                            {meta.fileHandler.icon}
                          </div>
                        )}
                        <div className="flex-1">
                          <CardTitle className="text-base">
                            {meta.fileHandler.title}
                          </CardTitle>
                          <CardDescription className="text-sm mt-1">
                            {meta.fileHandler.description}
                          </CardDescription>
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <svg
                              className="h-3 w-3 text-primary-foreground"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path d="M5 13l4 4L19 7"></path>
                            </svg>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                )
              })
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center space-x-2 pt-4 border-t">
          <Checkbox
            id="remember"
            checked={rememberChoice}
            onCheckedChange={(checked) => setRememberChoice(checked === true)}
          />
          <Label
            htmlFor="remember"
            className="text-sm font-normal cursor-pointer"
          >
            Always use this application for {fileExtension} files
          </Label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedHandlerId}>
            Open
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
