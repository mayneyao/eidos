"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { Button } from "@/components/ui/button"
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

const securityFormSchema = z.object({
  webSecurity: z.boolean(),
})

type SecurityFormValues = z.infer<typeof securityFormSchema>

export function SecurityForm() {
  const { t } = useTranslation()
  const [isInitialized, setIsInitialized] = useState(false)

  const form = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: undefined,
  })
  const { reset, watch } = form

  useEffect(() => {
    if (!isInitialized) return

    const subscription = watch(async (value) => {
      if (typeof value.webSecurity !== "undefined") {
        await window.eidos.config.set("security", { webSecurity: value.webSecurity })
        toast({
          title: t("settings.security.settingsUpdated"),
        })
        await window.eidos.reloadApp()
      }
    })

    return () => subscription.unsubscribe()
  }, [watch, t, isInitialized])

  useEffect(() => {
    const loadConfig = async () => {
      const securityConfig = await window.eidos.config.get("security")
      reset({ webSecurity: securityConfig?.webSecurity ?? true })
      setIsInitialized(true)
    }

    loadConfig()
  }, [reset])

  if (!isInitialized) {
    return null
  }

  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="webSecurity"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">
                  {t("settings.security.webSecurity")}
                </FormLabel>
                <FormDescription>
                  {t("settings.security.webSecurityDescription")}
                </FormDescription>
              </div>
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
      </form>
    </Form>
  )
}
