import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CableIcon, CopyIcon, UnplugIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { URLS } from "@/lib/const"
import { getToday, uuidv7 } from "@/lib/utils"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useApiAgentStatus } from "@/apps/desktop/renderer/hooks/useApiAgentStatus"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { CodeExample } from "./api/code-example"

const apiAgentFormSchema = z.object({
  url: z.string().url(),
  enabled: z.boolean(),
})

type APIAgentFormValues = z.infer<typeof apiAgentFormSchema>

const defaultValues: APIAgentFormValues = {
  url: "",
  enabled: false,
}

const LOCAL_API_ENDPOINT = "http://localhost:13127/rpc"

export function GlobalAPISettings() {
  const { t } = useTranslation()
  const apiStatus = useApiAgentStatus()
  const { lastOpenedDatabase } = useLastOpened()

  const [showRegenDialog, setShowRegenDialog] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [showRemoteExample, setShowRemoteExample] = useState(false)

  const form = useForm<APIAgentFormValues>({
    resolver: zodResolver(apiAgentFormSchema),
    defaultValues: undefined,
  })
  const { reset, watch } = form

  useEffect(() => {
    if (!isInitialized) return

    const subscription = watch(async (value) => {
      if (value.url && typeof value.enabled !== "undefined") {
        await window.eidos.config.set("apiAgentConfig", value as any)
        toast({
          title: t("settings.api.settingsUpdated"),
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [watch, t, isInitialized])

  useEffect(() => {
    const loadConfig = async () => {
      const apiAgentConfig = await window.eidos.config.get("apiAgentConfig")
      const loadedConfig = apiAgentConfig || defaultValues
      reset(loadedConfig)
      setIsInitialized(true)
    }

    loadConfig()
  }, [reset])

  if (!isInitialized) {
    return null
  }

  const regen = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowRegenDialog(true)
  }

  const handleRegen = () => {
    const url = new URL(URLS.API_AGENT_SERVER)
    url.pathname = `/rpc/${uuidv7()}`
    url.protocol = "https:"
    form.setValue("url", url.toString())
    form.trigger("url")
    setShowRegenDialog(false)
  }

  const handleCopyUrl = (e: React.MouseEvent, url: string) => {
    e.preventDefault()
    navigator.clipboard.writeText(url)
    toast({
      title: t("common.copied"),
    })
  }

  return (
    <Form {...form}>
      <div className="space-y-0">
        {/* Local Endpoint Section */}
        <div className="py-4">
          <h3 className="text-lg font-medium">
            {t("settings.api.localEndpoint")}
          </h3>
        </div>

        <hr className="border-border" />

        <div className="py-6">
          <div className="space-y-4">
            <div className="space-y-0.5">
              <Label>{t("settings.api.localEndpoint")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.api.localEndpointDescription")}
              </p>
            </div>
            <div className="flex gap-2 max-w-2xl items-center">
              <Input value={LOCAL_API_ENDPOINT} readOnly className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => handleCopyUrl(e, LOCAL_API_ENDPOINT)}
              >
                <CopyIcon />
              </Button>
            </div>
          </div>
        </div>

        {/* Forwarding Section */}
        <div className="py-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <div className="flex items-center gap-2">
              {t("settings.api.forwarding")}
              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                {t("common.badge.alpha")}
              </span>
            </div>
            {apiStatus.connected ? (
              <CableIcon className="h-5 w-5 text-green-500" />
            ) : (
              <UnplugIcon className="h-5 w-5 text-red-500" />
            )}
          </h3>
        </div>

        <hr className="border-border" />

        <div className="py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.api.enable")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.api.enableDescription")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("settings.api.rpcUrl")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.api.rpcUrlDescription")}
                </p>
              </div>
              <div className="max-w-2xl">
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-2 items-center">
                        <FormControl>
                          <Input {...field} readOnly className="flex-1" />
                        </FormControl>
                        <Button
                          variant="ghost"
                          onClick={(e) => handleCopyUrl(e, field.value)}
                        >
                          <CopyIcon />
                        </Button>
                        <Button variant="secondary" onClick={regen}>
                          {t("settings.api.regenerate")}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Code Example Section */}
        <div className="py-4">
          <h3 className="text-lg font-medium">
            {t("settings.api.codeExample")}
          </h3>
        </div>

        <hr className="border-border" />

        <div className="py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-0.5">
              <Label>{t("settings.api.codeExample")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.api.codeExampleDescription")}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground text-right">
                {showRemoteExample
                  ? t("settings.api.networkExample")
                  : t("settings.api.localExample")}
              </span>
              <Switch
                checked={showRemoteExample}
                onCheckedChange={setShowRemoteExample}
              />
            </div>
          </div>
          <CodeExample
            space={lastOpenedDatabase}
            endpoint={
              showRemoteExample ? form.watch("url") : LOCAL_API_ENDPOINT
            }
            date={getToday()}
          />
        </div>

        <AlertDialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings.api.regenConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.api.regenConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleRegen}>
                {t("common.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Form>
  )
}
