import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/react-hook-form/form"

import { SettingsSection } from "../settings-surface"

const storageFormSchema = z.object({
  dataFolder: z.string().nonempty("Data folder is required"),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function GlobalStorageSettings() {
  const { t } = useTranslation()
  const [dataFolder, setDataFolder] = useState<string | null>(null)
  const [originalDataFolder, setOriginalDataFolder] = useState<string | null>(
    null
  )
  const [hasChanges, setHasChanges] = useState(false)

  const form = useForm<StorageFormValues>({
    resolver: zodResolver(storageFormSchema),
  })

  useEffect(() => {
    const loadConfig = async () => {
      const dataFolder = await window.eidos.config.get("dataFolder")
      const folder = dataFolder || ""
      setDataFolder(folder)
      setOriginalDataFolder(folder)
    }

    loadConfig()
  }, [])

  useEffect(() => {
    form.setValue("dataFolder", dataFolder || "")
  }, [form, dataFolder])

  useEffect(() => {
    // Check if the current dataFolder is different from the original
    setHasChanges(dataFolder !== originalDataFolder && dataFolder !== null)
  }, [dataFolder, originalDataFolder])

  const handleSelectDataFolder = async () => {
    const selectedFolder = await window.eidos.selectFolder()
    if (selectedFolder) {
      setDataFolder(selectedFolder)
    }
  }

  const handleOpenDataFolder = () => {
    if (dataFolder) {
      window.eidos.showInFileManager(dataFolder)
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
    setOriginalDataFolder(data.dataFolder)
    setHasChanges(false)

    toast({
      title: t("settings.storage.settingsUpdated"),
    })
    await window.eidos.reloadApp()
  }

  return (
    <div className="space-y-8">
      {/* Data Folder Section */}
      <SettingsSection
        title={t("settings.storage.dataFolder")}
        description={t("settings.storage.dataFolderDescription")}
        actions={
          hasChanges ? (
            <Button type="button" onClick={() => onSubmit()}>
              {t("common.update")}
            </Button>
          ) : null
        }
      >
        <Form {...form}>
          <form className="py-5 space-y-6">
            <div className="max-w-2xl">
              <FormField
                control={form.control}
                name="dataFolder"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t(
                            "settings.storage.selectDataFolderPlaceholder"
                          )}
                          readOnly
                          className="flex-1"
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
