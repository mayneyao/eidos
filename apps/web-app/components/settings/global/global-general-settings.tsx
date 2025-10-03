import { useEffect, useState } from "react"
import i18n from "@/locales/i18n"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowDownCircle,
  CheckCircle,
  ChevronDown,
  Download,
  RefreshCw,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { EIDOS_VERSION, isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { URLS } from "@/lib/const"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
import { useActivationCodeStore } from "@/apps/web-app/hooks/use-activation"
import { useDesktopClient } from "@/apps/web-app/hooks/use-desktop-client"
import { useEidosFileSystemManager } from "@/apps/web-app/hooks/use-fs"
import { useUpdateStatus } from "@/apps/web-app/hooks/use-update-status"
import { useConfigStore } from "@/components/settings/stores"
import { uuidv7 } from "@/lib/utils"

const profileFormSchema = z.object({
  username: z
    .string()
    .min(2, {
      message: "Username must be at least 2 characters.",
    })
    .max(30, {
      message: "Username must not be longer than 30 characters.",
    }),
  userId: z.string().optional(),
  avatar: z.string().optional(),
})

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "dark"], {
    required_error: "Please select a theme.",
  }),
  language: z.enum(["en", "zh"], {
    invalid_type_error: "Select a language",
    required_error: "Please select a language.",
  }),
})

type ProfileFormValues = z.infer<typeof profileFormSchema>
type AppearanceFormValues = z.infer<typeof appearanceFormSchema>

/**
 * Constructs a changelog URL for a specific version
 * @param version - The version string (e.g., "0.24.6")
 * @param lang - The language code (default: "en")
 * @returns The complete changelog URL with version anchor
 */
function getChangelogUrl(version: string, lang: string = "en"): string {
  return `${URLS.CHANGELOG}/?lang=${lang}#v${version}`
}

export function GlobalGeneralSettings() {
  const { t } = useTranslation()
  const { setProfile, profile } = useConfigStore()
  const { clientId } = useActivationCodeStore()
  const { efsManager } = useEidosFileSystemManager()
  const { isDesktop } = useDesktopClient()
  const { theme, setTheme } = useTheme()
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    checkForUpdates,
    quitAndInstall,
  } = useUpdateStatus()

  // Profile form
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: profile?.username || "",
      userId: profile?.userId || "",
      avatar: profile?.avatar || "",
    },
    mode: "onChange",
  })

  // Appearance form
  const appearanceForm = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues: {
      theme: "light",
      language: "en",
    },
  })

  // Auto update state
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)

  // Load appearance preferences
  useEffect(() => {
    const savedPreferences = localStorage.getItem("appearancePreferences")
    if (savedPreferences) {
      const parsedPreferences = JSON.parse(savedPreferences)
      appearanceForm.reset(parsedPreferences)
      i18n.changeLanguage(parsedPreferences.language)
    }

    const subscription = appearanceForm.watch((data) => {
      if (data.theme || data.language) {
        savePreferences(data as AppearanceFormValues)
      }
    })

    return () => subscription.unsubscribe()
  }, [appearanceForm])

  // Load auto update config
  useEffect(() => {
    if (!isDesktop) return

    const loadAutoUpdateConfig = async () => {
      try {
        const config = await (window as any).eidos.config.get("autoUpdate")
        setAutoUpdateEnabled(config?.enabled ?? true)
      } catch (error) {
        console.error("Failed to load auto-update config:", error)
        setAutoUpdateEnabled(true)
      } finally {
        setIsLoadingConfig(false)
      }
    }

    loadAutoUpdateConfig()
  }, [isDesktop])

  function savePreferences(data: AppearanceFormValues) {
    localStorage.setItem("appearancePreferences", JSON.stringify(data))
    i18n.changeLanguage(data.language)
    setTheme(data.theme)
  }

  const handleChangeAvatar = async (field: any) => {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Images",
            accept: {
              "image/*": [".png", ".gif", ".jpeg", ".jpg"],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      })
      const file = await fileHandle.getFile()

      const res = await efsManager?.addFile(["static"], file)
      if (!res) {
        throw new Error("Failed to upload avatar.")
      }
      const url = "/" + res?.join("/")
      field.onChange(url)

      const currentProfile = profileForm.getValues()
      setProfile({ 
        ...currentProfile, 
        avatar: url,
        userId: currentProfile.userId || uuidv7()
      })

      toast({
        title: t("settings.profile.avatarUpdateSuccess"),
      })
    } catch (error) {
      console.error("Error changing avatar:", error)
      toast({
        title: t("settings.profile.avatarUpdateError"),
        variant: "destructive",
      })
    }
  }

  const handleToggleAutoUpdate = async (enabled: boolean) => {
    if (!isDesktop) return

    try {
      await (window as any).eidos.config.set("autoUpdate", { enabled })
      setAutoUpdateEnabled(enabled)
    } catch (error) {
      toast({
        title: t("settings.general.autoUpdateUpdateFailed"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-0">
      {/* App Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">{t("settings.general.app")}</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-6">
          {/* Current Version */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("settings.general.currentVersion")}</Label>
              <p className="text-sm text-muted-foreground">
                {EIDOS_VERSION}{" "}
                {isDesktopMode
                  ? t("nav.dropdown.menu.desktop")
                  : t("nav.dropdown.menu.web")}{" "}
                <a
                  href={getChangelogUrl(EIDOS_VERSION, appearanceForm.getValues("language"))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {t("settings.general.whatsNew")}
                </a>
              </p>
            </div>
            <div className="text-sm font-mono text-muted-foreground">
              v{EIDOS_VERSION}
            </div>
          </div>

          {/* Check for Updates */}
          {isDesktopMode && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.general.checkForUpdates")}</Label>
                <p className="text-sm text-muted-foreground">
                  {updateStatus === "available" && updateInfo?.version && (
                    <span className="text-green-600">
                      {t("settings.general.updateAvailable")} v
                      {updateInfo.version}{" "}
                      <a
                        href={getChangelogUrl(updateInfo.version, appearanceForm.getValues("language"))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        {t("settings.general.whatsNew")}
                      </a>
                    </span>
                  )}
                  {updateStatus === "not-available" && (
                    <span className="text-muted-foreground">
                      {t("settings.general.noUpdatesAvailable")}
                    </span>
                  )}
                  {updateStatus === "checking" && (
                    <span className="text-blue-600">
                      {t("settings.general.checkingForUpdates")}
                    </span>
                  )}
                  {updateStatus === "downloaded" && (
                    <span className="text-orange-600">
                      {t("settings.general.restartToInstall")}
                    </span>
                  )}
                  {updateStatus === "progress" && updateProgress && (
                    <span className="text-blue-600">
                      {t("settings.general.downloading")} (
                      {Math.round(updateProgress.percent || 0)}%)
                    </span>
                  )}
                  {updateStatus === "idle" && (
                    <span className="text-muted-foreground">
                      Click to check for updates
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {updateStatus === "available" && (
                  <Button
                    onClick={quitAndInstall}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("settings.general.restartToInstall")}
                  </Button>
                )}
                {updateStatus === "downloaded" && (
                  <Button
                    onClick={quitAndInstall}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("settings.general.restartToInstall")}
                  </Button>
                )}
                {updateStatus === "progress" && (
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(updateProgress?.percent || 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(updateProgress?.percent || 0)}%
                    </span>
                  </div>
                )}
                {(updateStatus === "idle" ||
                  updateStatus === "not-available" ||
                  updateStatus === "error") && (
                  <Button
                    onClick={checkForUpdates}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("settings.general.checkForUpdates")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Auto Update */}
          {isDesktop && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.general.enableAutoUpdate")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.enableAutoUpdateDescription")}
                </p>
              </div>
              <Switch
                checked={autoUpdateEnabled}
                onCheckedChange={handleToggleAutoUpdate}
                disabled={isLoadingConfig}
              />
            </div>
          )}
        </div>
      </div>
      {/* Appearance Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("settings.appearance.title")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <Form {...appearanceForm}>
          <form className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.appearance.language")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.appearance.languageDescription")}
                </p>
              </div>
              <div className="w-64">
                <FormField
                  control={appearanceForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <div className="relative">
                        <FormControl>
                          <select
                            className={cn(
                              buttonVariants({ variant: "outline" }),
                              "w-full appearance-none bg-transparent font-normal"
                            )}
                            {...field}
                          >
                            <option value="en">English</option>
                            <option value="zh">Chinese</option>
                          </select>
                        </FormControl>
                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50" />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.appearance.theme")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.appearance.themeDescription")}
                </p>
              </div>
              <div className="w-64">
                <FormField
                  control={appearanceForm.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange as any}
                          defaultValue={field.value}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="light" id="light" />
                            <Label htmlFor="light">
                              {t("settings.appearance.light")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="dark" id="dark" />
                            <Label htmlFor="dark">
                              {t("settings.appearance.dark")}
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* Profile Section */}
      <div className="py-4">
        <h3 className="text-lg font-medium">{t("settings.general.profile")}</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <Form {...profileForm}>
          <form className="space-y-6">
            {/* Avatar and Username */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("settings.general.avatar")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.avatarDescription")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <FormField
                  control={profileForm.control}
                  name="avatar"
                  render={({ field }) => (
                    <FormItem>
                      <Avatar
                        className="h-12 w-12 cursor-pointer"
                        onClick={() => handleChangeAvatar(field)}
                      >
                        <AvatarImage
                          src={field.value}
                          className="object-cover"
                        />
                        <AvatarFallback>
                          {profileForm
                            .getValues("username")?.[0]
                            ?.toUpperCase() ?? "E"}
                        </AvatarFallback>
                      </Avatar>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t("common.name")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.nameDescription")}
                </p>
              </div>
              <div className="w-64">
                <FormField
                  control={profileForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="yahaha" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="items-center justify-between hidden">
              <div className="space-y-0.5">
                <Label>{t("settings.general.clientId")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.clientIdDescription")}
                </p>
              </div>
              <div className="w-64">
                <Input disabled value={clientId} />
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
