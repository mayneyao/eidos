import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ExternalLink, FolderOpen, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/react-hook-form/form"

import { SetupLayout } from "./shared-layout"
import { useViewTransition } from "./useViewTransition"

const storageFormSchema = z.object({
  dataFolder: z.string().min(1, "Data folder is required"),
  language: z.enum(["en", "zh"]),
  theme: z.enum(["light", "dark"]),
})

type StorageFormValues = z.infer<typeof storageFormSchema>

export function InitialStorageSetup() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const { navigateWithTransition } = useViewTransition()
  const [dataFolder, setDataFolder] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<StorageFormValues>({
    resolver: zodResolver(storageFormSchema),
    defaultValues: {
      dataFolder: "",
      language: "en",
      theme: "light",
    },
  })

  useEffect(() => {
    const loadConfig = async () => {
      const dataFolder = await window.eidos.config.get("dataFolder")
      setDataFolder(dataFolder || "")
    }

    // Load saved appearance preferences
    const savedPreferences = localStorage.getItem("appearancePreferences")
    if (savedPreferences) {
      const parsedPreferences = JSON.parse(savedPreferences)
      const savedTheme = parsedPreferences.theme === "dark" ? "dark" : "light"
      const savedLang = parsedPreferences.language === "zh" ? "zh" : "en"
      form.setValue("theme", savedTheme)
      form.setValue("language", savedLang)
    } else {
      // Set defaults based on current settings
      const currentTheme = theme === "dark" ? "dark" : "light"
      const currentLang = i18n.language === "zh" ? "zh" : "en"
      form.setValue("theme", currentTheme)
      form.setValue("language", currentLang)
    }

    loadConfig()
  }, [])

  useEffect(() => {
    form.setValue("dataFolder", dataFolder || "")
  }, [form, dataFolder])

  // Watch form changes and save preferences
  useEffect(() => {
    const subscription = form.watch((data) => {
      if (data.theme || data.language) {
        saveAppearancePreferences(data)
      }
    })

    return () => subscription.unsubscribe()
  }, [form])

  function saveAppearancePreferences(data: Partial<StorageFormValues>) {
    if (data.theme && data.language) {
      const preferences = {
        theme: data.theme,
        language: data.language,
      }
      localStorage.setItem("appearancePreferences", JSON.stringify(preferences))
      i18n.changeLanguage(data.language)
      setTheme(data.theme)
    }
  }

  const handleSelectDataFolder = async () => {
    try {
      const selectedFolder = await window.eidos.selectFolder()
      if (selectedFolder) {
        setDataFolder(selectedFolder)
        // Also update the form value immediately
        form.setValue("dataFolder", selectedFolder)
        // Clear any previous validation errors
        form.clearErrors("dataFolder")
      }
    } catch (error) {
      console.error("Failed to select data folder:", error)
      toast({
        title: t ? t("common.error") : "Error",
        description: t
          ? t("settings.storage.failedToSelectFolder")
          : "Failed to select folder",
        variant: "destructive",
      })
    }
  }

  const handleOpenDataFolder = () => {
    if (dataFolder) {
      try {
        window.eidos.showInFileManager(dataFolder)
      } catch (error) {
        console.error("Failed to open data folder:", error)
        toast({
          title: t ? t("common.error") : "Error",
          description: t
            ? t("settings.storage.failedToOpenFolder")
            : "Failed to open folder",
          variant: "destructive",
        })
      }
    }
  }

  async function onSubmit() {
    const data = form.getValues()

    if (!data.dataFolder) {
      toast({
        title: t
          ? t("settings.storage.dataFolderNotSelected")
          : "Data folder not selected",
        description: t
          ? t("settings.storage.selectDataFolder")
          : "Please select a folder to store your data",
      })
      return
    }

    setIsLoading(true)
    try {
      // Set the data folder using the same method as desktop settings
      await window.eidos.config.set("dataFolder", data.dataFolder)
      const isDataFolderSet = await window.eidos.checkIsDataFolderSet()
      if (!isDataFolderSet) {
        toast({
          title: t ? t("common.error") : "Error",
          description: t
            ? t("settings.storage.failedToSetDataFolder")
            : "Failed to complete setup",
          variant: "destructive",
        })
        return
      }
      navigateWithTransition("/create-space")
    } catch (error) {
      console.error("Failed to set data folder:", error)
      toast({
        title: t ? t("common.error") : "Error",
        description: t
          ? t("settings.storage.failedToSetDataFolder")
          : "Failed to complete setup",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to get theme icon
  const getThemeIcon = (themeValue: string) => {
    switch (themeValue) {
      case "dark":
        return <Moon className="w-4 h-4 text-muted-foreground" />
      case "light":
        return <Sun className="w-4 h-4 text-muted-foreground" />
      default:
        return <Sun className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <SetupLayout>
      <div className="max-w-lg mx-auto">
        {/* Main Card */}
        <div
          className="bg-card rounded-3xl shadow-2xl border overflow-hidden"
          style={{ viewTransitionName: "setup-card" } as React.CSSProperties}
        >
          <div className="px-6 pt-6 pb-4">
            <div
              className="text-center"
              style={
                { viewTransitionName: "setup-header" } as React.CSSProperties
              }
            >
              <div className="w-16 h-16 mx-auto mb-4 bg-primary rounded-2xl flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold text-card-foreground mb-2">
                {t ? t("setup.title") : "Welcome to Eidos"}
              </h1>
              <p className="text-muted-foreground text-base">
                {t
                  ? t("setup.subtitle")
                  : "Let's set up your data storage and preferences to get started"}
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div className="px-6 pb-6">
            <Form {...form}>
              <form className="space-y-5">
                {/* Data Folder Selection */}
                <FormField
                  control={form.control}
                  name="dataFolder"
                  render={({ field }) => (
                    <FormItem>
                      <label className="text-card-foreground font-medium"></label>
                      <FormControl>
                        <div className="flex items-stretch gap-2">
                          {/* Path Display */}
                          <div className="flex-1 min-w-0 relative">
                            <div className="px-3 py-1 bg-muted border rounded-lg h-full flex items-center">
                              {dataFolder ? (
                                <div className="flex-1 min-w-0">
                                  <div
                                    className="font-mono text-xs text-card-foreground truncate"
                                    title={dataFolder}
                                  >
                                    {dataFolder}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">
                                  {t
                                    ? t("settings.storage.selectDataFolder")
                                    : "No folder selected"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={handleSelectDataFolder}
                              size="sm"
                              className="px-4 whitespace-nowrap"
                            >
                              {t ? t("common.select") : "Select"}
                            </Button>
                            {dataFolder && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleOpenDataFolder}
                                className="px-3 whitespace-nowrap"
                              >
                                <ExternalLink className="w-4 h-4" />
                                <span className="ml-1 hidden sm:inline">
                                  {t ? t("common.open") : "Open"}
                                </span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </FormControl>

                      <p className="text-xs text-muted-foreground mt-2">
                        {t
                          ? t("setup.dataFolder.description")
                          : "Choose where to store your Eidos data. You can change this later in settings."}
                      </p>
                    </FormItem>
                  )}
                />

                {/* Appearance Settings */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Language Selection */}
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-card-foreground font-medium"></label>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="zh">中文</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Theme Selection */}
                  <FormField
                    control={form.control}
                    name="theme"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-card-foreground font-medium"></label>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">
                                <div className="flex items-center gap-2">
                                  {getThemeIcon("light")}
                                  {t ? t("settings.appearance.light") : "Light"}
                                </div>
                              </SelectItem>
                              <SelectItem value="dark">
                                <div className="flex items-center gap-2">
                                  {getThemeIcon("dark")}
                                  {t ? t("settings.appearance.dark") : "Dark"}
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-4">
                  <Button
                    type="button"
                    onClick={onSubmit}
                    size="lg"
                    disabled={isLoading || !dataFolder}
                    className="w-full h-12 text-base font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t
                          ? t("common.setting", "Setting up...")
                          : "Setting up..."}
                      </div>
                    ) : t ? (
                      t("setup.continue", "Continue")
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </SetupLayout>
  )
}

export default function InitialSetupPage() {
  return <InitialStorageSetup />
}
