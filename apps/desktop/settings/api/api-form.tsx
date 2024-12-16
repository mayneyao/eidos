"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CableIcon, CopyIcon, UnplugIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { DOMAINS } from "@/lib/const"
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
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useLastOpened } from "@/apps/web-app/[database]/hook"

import { useApiAgentStatus } from "../../hooks/useApiAgentStatus"
import { CodeExample } from "./code-example"

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

export function ApiForm() {
  const { t } = useTranslation()
  const apiStatus = useApiAgentStatus()

  const [showRegenDialog, setShowRegenDialog] = useState(false)
  const { lastOpenedDatabase } = useLastOpened()
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
        await window.eidos.config.set("apiAgentConfig", value)
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
    const url = new URL(DOMAINS.API_AGENT_SERVER)
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
    <>
      <Form {...form}>
        <form className="space-y-8">
          <div className="space-y-6">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-lg font-medium">
                {t("settings.api.localEndpoint")}
              </h3>

              <FormItem>
                <div className="flex gap-2">
                  <Input value={LOCAL_API_ENDPOINT} readOnly />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleCopyUrl(e, LOCAL_API_ENDPOINT)}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </Button>
                </div>
                <FormDescription>
                  {t("settings.api.localEndpointDescription")}
                </FormDescription>
              </FormItem>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                {t("settings.api.forwarding")}
                {apiStatus.connected ? (
                  <CableIcon className="h-5 w-5 text-green-500" />
                ) : (
                  <UnplugIcon className="h-5 w-5 text-red-500" />
                )}
              </h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>{t("settings.api.enable")}</FormLabel>
                  <FormDescription>
                    {t("settings.api.enableDescription")}{" "}
                  </FormDescription>
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

              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.api.rpcUrl")}</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input {...field} readOnly />
                        <Button variant="secondary" onClick={regen}>
                          {t("settings.api.regenerate")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleCopyUrl(e, field.value)}
                        >
                          <CopyIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {t("settings.api.rpcUrlDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-lg border p-4 w-full">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium">
                  {t("settings.api.codeExample")}
                </h3>
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
          </div>
        </form>
      </Form>

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
    </>
  )
}
