import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import type { AppConfig, GraftConfig } from "@/apps/desktop/electron/config"

import { useEngine } from "@/apps/web-app/hooks/use-engine"
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

type SyncFormData = {
  enabled: boolean
} & Partial<GraftConfig>

type SyncConfig = AppConfig["sync"]

export function GlobalSyncSettings() {
  const { t } = useTranslation()
  const [initialConfig, setInitialConfig] = useState<SyncConfig | null>(null)
  const { reload } = useEngine()

  const form = useForm<SyncFormData>({
    defaultValues: {
      enabled: false,
    },
  })

  useEffect(() => {
    async function fetchConfig() {
      if (window.eidos?.config) {
        const syncConfig = await window.eidos.config.get("sync")
        setInitialConfig(syncConfig)
        form.reset({
          enabled: syncConfig.enabled,
          ...syncConfig.graft,
        })
      }
    }
    fetchConfig()
  }, [form])

  async function onSubmit(data: SyncFormData) {
    if (window.eidos?.config) {
      try {
        const { enabled, ...graftConfig } = data

        const syncConfigToSave: SyncConfig = {
          enabled: enabled,
          graft: graftConfig as GraftConfig,
        }

        await window.eidos.config.set("sync", syncConfigToSave)
        toast({
          title: "Success",
          description: "Sync settings saved.",
        })

        const updatedConfig = await window.eidos.config.get("sync")
        setInitialConfig(updatedConfig)
        form.reset({
          enabled: updatedConfig.enabled,
          ...updatedConfig.graft,
        })
        await reload()
      } catch (error) {
        console.error("Failed to save sync settings:", error)
        toast({
          title: "Error",
          description: "Failed to save sync settings.",
          variant: "destructive",
        })
      }
    } else {
      toast({
        title: "Error",
        description: "Configuration manager not available.",
        variant: "destructive",
      })
    }
  }

  async function testStoreConnection(
    storeFieldName: keyof GraftConfig,
    storeName: string
  ) {
    const storeUrlValue = form.getValues(storeFieldName)

    if (typeof storeUrlValue !== "string" || !storeUrlValue) {
      toast({
        title: "Error",
        description: `Please enter a valid ${storeName} URL.`,
        variant: "destructive",
      })
      return
    }

    const storeUrl: string = storeUrlValue

    let healthUrl: URL
    try {
      const baseUrl = storeUrl.endsWith("/") ? storeUrl : `${storeUrl}/`
      healthUrl = new URL("health", baseUrl)
    } catch (error) {
      toast({
        title: "Error",
        description: `Invalid ${storeName} URL format.`,
        variant: "destructive",
      })
      return
    }

    try {
      const response = await window.eidos.fetch(healthUrl.toString(), {
        method: "GET",
      })
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      const text = response.data
      if (text.trim().toLowerCase() === "ok") {
        toast({
          title: "Success",
          description: `${storeName} connection successful!`,
        })
      } else {
        toast({
          title: "Error",
          description: `${storeName} connection test failed. Expected "ok", received "${text}".`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error(`${storeName} connection test failed:`, error)
      toast({
        title: "Error",
        description: `${storeName} connection failed: ${error.message}`,
        variant: "destructive",
      })
    }
  }

  async function testMetaStoreConnection() {
    await testStoreConnection("metastore", "MetaStore")
  }

  async function testPageStoreConnection() {
    await testStoreConnection("pagestore", "PageStore")
  }

  if (!initialConfig) {
    return <div>Loading sync settings...</div>
  }

  return (
    <div className="space-y-0">
      {/* Enable Sync Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.sync.enable")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.sync.enable")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.enableDescription")}
              </p>
            </div>
            <Form {...form}>
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
            </Form>
          </div>
        </div>
      </div>

      {/* MetaStore Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.sync.metaStore")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.sync.metaStoreUrl")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.metaStoreDescription")}
              </p>
            </div>
            <div className="w-64">
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="metastore"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-2">
                        <FormControl>
                          <Input placeholder="http://127.0.0.1:3001" {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={testMetaStoreConnection}
                          disabled={!form.watch("metastore")}
                        >
                          {t("settings.sync.testConnection")}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
          </div>
        </div>
      </div>

      {/* PageStore Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.sync.pageStore")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.sync.pageStoreUrl")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.pageStoreDescription")}
              </p>
            </div>
            <div className="w-64">
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="pagestore"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-2">
                        <FormControl>
                          <Input placeholder="http://127.0.0.1:3000" {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={testPageStoreConnection}
                          disabled={!form.watch("pagestore")}
                        >
                          {t("settings.sync.testConnection")}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
          </div>
        </div>
      </div>

      {/* AutoSync Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.sync.autoSync")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.sync.enableAutoSync")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.autoSyncDescription")}
              </p>
            </div>
            <Form {...form}>
              <FormField
                control={form.control}
                name="autosync"
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
            </Form>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.sync.saveChanges")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.saveChangesDescription")}
              </p>
            </div>
            <Button type="button" onClick={form.handleSubmit(onSubmit)} disabled={!form.formState.isDirty}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
