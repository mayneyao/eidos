import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { LLMProvider } from "@/packages/ai/config"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { AIProviderForm } from "./ai-provider-form"

interface AIProviderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider?: LLMProvider
  defaultValues?: Partial<LLMProvider>
  onSave: (provider: LLMProvider) => void
  existingNames?: string[]
}

export function AIProviderModal({
  open,
  onOpenChange,
  provider,
  defaultValues,
  onSave,
  existingNames = [],
}: AIProviderModalProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditing = !!provider
  const title = isEditing
    ? t("settings.ai.editProvider")
    : t("settings.ai.addProvider")

  const handleSave = async (providerData: LLMProvider) => {
    setIsSubmitting(true)
    try {
      await onSave(providerData)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("settings.ai.editProviderDescription")
              : t("settings.ai.addProviderDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <AIProviderForm
            provider={provider}
            defaultValues={defaultValues}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
            existingNames={existingNames}
            isSubmitting={isSubmitting}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
