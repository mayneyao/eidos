import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

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
  FormMessage,
} from "@/components/react-hook-form/form"

import { SettingsSection } from "../settings-surface"

const securityFormSchema = z.object({
  webSecurity: z.boolean(),
  crossOriginDomains: z.array(z.string()),
})

type SecurityFormValues = z.infer<typeof securityFormSchema>

export function GlobalSecuritySettings() {
  const { t } = useTranslation()
  const [isInitialized, setIsInitialized] = useState(false)
  const [originalValues, setOriginalValues] =
    useState<SecurityFormValues | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const form = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: undefined,
  })
  const { reset, watch } = form

  useEffect(() => {
    if (!isInitialized || !originalValues) return

    const subscription = watch((value) => {
      // Check if current values are different from original values
      const hasWebSecurityChanged =
        value.webSecurity !== originalValues.webSecurity
      const hasDomainsChanged =
        JSON.stringify(value.crossOriginDomains) !==
        JSON.stringify(originalValues.crossOriginDomains)
      setHasChanges(hasWebSecurityChanged || hasDomainsChanged)
    })

    return () => subscription.unsubscribe()
  }, [watch, isInitialized, originalValues])

  const onSubmit = async (value: SecurityFormValues) => {
    await window.eidos.config.set("security", {
      webSecurity: value.webSecurity ?? true,
      crossOriginDomains:
        value.crossOriginDomains?.filter(
          (domain): domain is string => typeof domain === "string"
        ) || [],
    })
    setOriginalValues(value)
    setHasChanges(false)
    toast({
      title: t("settings.security.settingsUpdated"),
    })
    await window.eidos.reloadApp()
  }

  useEffect(() => {
    const loadConfig = async () => {
      const securityConfig = await window.eidos.config.get("security")
      const values = {
        webSecurity: securityConfig?.webSecurity ?? true,
        crossOriginDomains: securityConfig?.crossOriginDomains || [],
      }
      reset(values)
      setOriginalValues(values)
      setIsInitialized(true)
    }

    loadConfig()
  }, [reset])

  if (!isInitialized) {
    return null
  }

  return (
    <div className="space-y-8">
      {/* Security Section */}
      <SettingsSection
        title={t("settings.security.title")}
        actions={
          hasChanges ? (
            <Button type="button" onClick={() => form.handleSubmit(onSubmit)()}>
              {t("common.save")}
            </Button>
          ) : null
        }
      >
        <Form {...form}>
          <form className="py-5 space-y-6">
            {/* Web Security */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1 min-w-0">
                <Label>{t("settings.security.webSecurity")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.security.webSecurityDescription")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="webSecurity"
                render={({ field }) => (
                  <FormItem className="shrink-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Cross Origin Domains */}
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label>{t("settings.security.crossOriginDomains")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.security.crossOriginDomainsDescription")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="crossOriginDomains"
                render={({ field }) => (
                  <FormItem>
                    <div className="space-y-2">
                      {field.value.map((domain, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={domain}
                            onChange={(e) => {
                              const newDomains = [...field.value]
                              newDomains[index] = e.target.value
                              field.onChange(newDomains)
                            }}
                            placeholder="example.com"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                              const newDomains = field.value.filter(
                                (_, i) => i !== index
                              )
                              field.onChange(newDomains)
                            }}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          field.onChange([...field.value, ""])
                        }}
                      >
                        {t("settings.security.addDomain")}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </SettingsSection>
    </div>
  )
}
