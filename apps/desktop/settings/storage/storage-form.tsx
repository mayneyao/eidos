"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const storageFormSchema = z.object({
  dataFolder: z.string().nonempty("Data folder is required"),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function StorageForm() {
  const { t } = useTranslation()
  const [dataFolder, setDataFolder] = useState<string | null>(null)

  const form = useForm<StorageFormValues>({
    resolver: zodResolver(storageFormSchema),
  })

  useEffect(() => {
    const loadConfig = async () => {
      const dataFolder = await window.eidos.config.get("dataFolder")
      setDataFolder(dataFolder || "")
    }

    loadConfig()
  }, [])

  useEffect(() => {
    form.setValue("dataFolder", dataFolder || "")
  }, [form, dataFolder])

  const handleSelectDataFolder = async () => {
    const selectedFolder = await window.eidos.selectFolder()
    if (selectedFolder) {
      setDataFolder(selectedFolder)
    }
  }

  const handleOpenDataFolder = () => {
    if (dataFolder) {
      window.eidos.openFolder(dataFolder)
    }
  }

  async function onSubmit() {
    const data = form.getValues()

    if (!data.dataFolder) {
      toast({
        title: t("settings.storage.dataFolderNotSelected"),
        description: t("settings.storage.selectDataFolder"),
      })
      return
    }

    await window.eidos.config.set("dataFolder", data.dataFolder)

    toast({
      title: t("settings.storage.settingsUpdated"),
    })
    await window.eidos.reloadApp()
  }

  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="dataFolder"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t("settings.storage.dataFolder")}</FormLabel>
              <div className="flex gap-1">
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t("settings.storage.selectDataFolderPlaceholder")}
                    readOnly
                  />
                </FormControl>
                <Button type="button" onClick={handleSelectDataFolder}>
                  {t("common.select")}
                </Button>
                {dataFolder && (
                  <Button type="button" onClick={handleOpenDataFolder}>
                    {t("common.open")}
                  </Button>
                )}
              </div>
              <FormDescription>
                {t("settings.storage.dataFolderDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button" className="mt-4" onClick={() => onSubmit()}>
          {t("common.update")}
        </Button>
      </form>
    </Form>
  )
}
