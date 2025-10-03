import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Save, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { useConfigStore } from "@/components/settings/stores"
import { EIDOS_SPACE_BASE_URL } from "@/lib/const"

const apiKeyFormSchema = z.object({
  value: z.string().optional(),
})

type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>

export function GlobalKeyStoreSettings() {
  const { t } = useTranslation()
  const { extensionsManagerKey, setExtensionsManagerKey } = useConfigStore()
  const [showKeyValue, setShowKeyValue] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [originalValue, setOriginalValue] = useState<string>("")
  const [hasChanges, setHasChanges] = useState(false)

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      value: extensionsManagerKey || "",
    },
  })

  const { watch } = form

  useEffect(() => {
    const currentValue = extensionsManagerKey || ""
    form.reset({ value: currentValue })
    setOriginalValue(currentValue)
  }, [extensionsManagerKey, form])

  useEffect(() => {
    const subscription = watch((value) => {
      const currentValue = value.value || ""
      setHasChanges(currentValue !== originalValue)
    })

    return () => subscription.unsubscribe()
  }, [watch, originalValue])

  const onSubmit = (data: ApiKeyFormValues) => {
    const newKey = data.value?.trim()
    if (newKey && newKey.length > 0) {
      setExtensionsManagerKey(newKey)
      setOriginalValue(newKey)
      setHasChanges(false)
      toast({
        title: t("settings.apiKeyManagement.keySaved"),
        description: t("settings.apiKeyManagement.keySavedDescription"),
      })
    } else {
      if (extensionsManagerKey) {
        setExtensionsManagerKey(undefined)
        setOriginalValue("")
        setHasChanges(false)
        toast({
          title: t("settings.apiKeyManagement.keyCleared"),
          description: t("settings.apiKeyManagement.keyClearedDescription"),
        })
      }
    }
  }

  const handleClearKey = () => {
    setExtensionsManagerKey(undefined)
    form.reset({ value: "" })
    setOriginalValue("")
    setHasChanges(false)
    toast({
      title: t("settings.apiKeyManagement.keyCleared"),
      description: t("settings.apiKeyManagement.keyClearedDescription"),
    })
    setShowClearConfirm(false)
  }

  return (
    <div className="space-y-0">
      {/* API Key Management Section */}
      <div className="py-4 flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {t("settings.keyStore")}
        </h3>
        {hasChanges && (
          <Button 
            type="button"
            onClick={() => form.handleSubmit(onSubmit)()}
          >
            <Save className="mr-2 h-4 w-4" />
            {t("settings.apiKeyManagement.saveKey")}
          </Button>
        )}
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <Form {...form}>
          <form className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("settings.apiKeyManagement.publishingKey")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.apiKeyManagement.description")}{" "}
                  <a
                    href={`${EIDOS_SPACE_BASE_URL}/auth/login?redirect=/account?tab=api-keys`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {t("settings.apiKeyManagement.getKeyHere")}
                  </a>
                </p>
              </div>
              <div className="max-w-2xl">
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type={showKeyValue ? "text" : "password"}
                            placeholder={t("settings.apiKeyManagement.placeholder")}
                            {...field}
                            className="flex-1"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowKeyValue(!showKeyValue)}
                          disabled={!field.value}
                          title={showKeyValue ? "Hide key" : "Show key"}
                        >
                          {showKeyValue ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        {extensionsManagerKey && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowClearConfirm(true)}
                            className="text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("settings.apiKeyManagement.clearKey")}
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </form>
        </Form>
      </div>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.apiKeyManagement.confirmClearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.apiKeyManagement.confirmClearDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearKey}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              {t("settings.apiKeyManagement.confirmClear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
