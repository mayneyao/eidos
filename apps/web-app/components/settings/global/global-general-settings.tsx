import { useEffect, useState } from "react"
import i18n from "@/locales/i18n"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  CheckCircle,
  ChevronDown,
  ExternalLink,
  Github,
  RefreshCw,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"

import { URLS } from "@/lib/const"
import { EIDOS_COMMIT, EIDOS_VERSION, isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/react-hook-form/form"
import { useTheme } from "@/components/theme-provider"
import { DiscordIcon } from "@/components/icons/discord"
import { SETTINGS_EXTERNAL_LINKS } from "@/components/settings/settings-events"
import { useDesktopClient } from "@/apps/web-app/hooks/use-desktop-client"
import { useUpdateStatus } from "@/apps/web-app/hooks/use-update-status"
import { useSpaceTheme } from "@/apps/web-app/hooks/use-space-theme"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "dark"], {
    required_error: "Please select a theme.",
  }),
  language: z.enum(["en", "zh"], {
    invalid_type_error: "Select a language",
    required_error: "Please select a language.",
  }),
})

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
  const { isDesktop } = useDesktopClient()
  const { theme, setTheme } = useTheme()
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    checkForUpdates,
    quitAndInstall,
  } = useUpdateStatus()

  const { themes, currentTheme: spaceTheme, applyTheme } = useSpaceTheme()
  const { navigate } = useRouterAdapter()

  const { toast } = useToast()

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
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">(
    "stable"
  )
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

  // Load desktop configs (auto update)
  useEffect(() => {
    if (!isDesktop) {
      setIsLoadingConfig(false)
      return
    }

    const loadDesktopConfigs = async () => {
      try {
        // Load auto update config
        const autoUpdateConfig = await window.eidos.config.get("autoUpdate")
        setAutoUpdateEnabled(autoUpdateConfig?.enabled ?? true)
        setUpdateChannel(autoUpdateConfig?.channel ?? "stable")
      } catch (error) {
        console.error("Failed to load auto-update config:", error)
        setAutoUpdateEnabled(true)
        setUpdateChannel("stable")
      } finally {
        setIsLoadingConfig(false)
      }
    }

    loadDesktopConfigs()
  }, [isDesktop])

  function savePreferences(data: AppearanceFormValues) {
    localStorage.setItem("appearancePreferences", JSON.stringify(data))
    i18n.changeLanguage(data.language)
    setTheme(data.theme)
  }

  const handleToggleAutoUpdate = async (enabled: boolean) => {
    if (!isDesktop) return

    try {
      await window.eidos.config.set("autoUpdate", {
        enabled,
        channel: updateChannel,
      })
      setAutoUpdateEnabled(enabled)
    } catch (error) {
      toast({
        title: t("settings.general.autoUpdateUpdateFailed"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleChangeChannel = async (channel: "stable" | "beta") => {
    if (!isDesktop) return

    try {
      await window.eidos.config.set("autoUpdate", {
        enabled: autoUpdateEnabled,
        channel,
      })
      setUpdateChannel(channel)
      // Trigger a manual update check when channel changes
      checkForUpdates()
    } catch (error) {
      toast({
        title: t("settings.general.autoUpdateUpdateFailed"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-0" data-settings-row-groups="true">
      {/* App Section */}
      <div className="pb-2">
        <h3 className="text-[15px] font-medium">{t("settings.general.app")}</h3>
      </div>

      <hr className="border-border" />

      <div className="py-0">
        <div className="divide-y divide-border/70 [&>*]:py-4">
          {/* Current Version */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-0.5 flex-[5] min-w-[240px]">
              <Label>{t("settings.general.currentVersion")}</Label>
              <p className="text-sm text-muted-foreground">
                {EIDOS_VERSION}{" "}
                {isDesktopMode
                  ? t("nav.dropdown.menu.desktop")
                  : t("nav.dropdown.menu.web")}{" "}
                <a
                  href={getChangelogUrl(
                    EIDOS_VERSION,
                    appearanceForm.getValues("language")
                  )}
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
              {EIDOS_COMMIT && ` (${EIDOS_COMMIT})`}
            </div>
          </div>

          {/* Check for Updates */}
          {isDesktopMode && (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.general.checkForUpdates")}</Label>
                <p className="text-sm text-muted-foreground">
                  {updateStatus === "available" && updateInfo?.version && (
                    <span className="text-green-600">
                      {t("settings.general.updateAvailable")} v
                      {updateInfo.version}{" "}
                      <a
                        href={getChangelogUrl(
                          updateInfo.version,
                          appearanceForm.getValues("language")
                        )}
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
                      {Math.round(updateProgress.percent || 0)}
                      %)
                    </span>
                  )}
                  {updateStatus === "idle" && (
                    <span className="text-muted-foreground">
                      Click to check for updates
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {updateStatus === "available" && (
                  <Button
                    onClick={quitAndInstall}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("common.installAndRestart", "Install & Restart")}
                  </Button>
                )}
                {updateStatus === "downloaded" && (
                  <Button
                    onClick={quitAndInstall}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("common.installAndRestart", "Install & Restart")}
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
                    {t("common.checkUpdates", "Check Updates")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Auto Update */}
          {isDesktop && (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.general.enableAutoUpdate")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.enableAutoUpdateDescription")}
                </p>
              </div>
              <Switch
                checked={autoUpdateEnabled}
                onCheckedChange={handleToggleAutoUpdate}
                disabled={isLoadingConfig}
                className="shrink-0"
              />
            </div>
          )}

          {/* Update Channel */}
          {isDesktop && (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.general.updateChannel")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.general.updateChannelDescription")}
                </p>
              </div>
              <div className="w-full sm:w-64 shrink-0">
                <div className="relative">
                  <select
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full appearance-none bg-transparent font-normal"
                    )}
                    value={updateChannel}
                    onChange={(e) =>
                      handleChangeChannel(e.target.value as "stable" | "beta")
                    }
                    disabled={isLoadingConfig}
                  >
                    <option value="stable">
                      {t("settings.general.stable")}
                    </option>
                    <option value="beta">{t("settings.general.beta")}</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Appearance Section */}
      <div className="pb-2 pt-5">
        <h3 className="text-[15px] font-medium">
          {t("settings.appearance.title")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-0">
        <Form {...appearanceForm}>
          <form className="divide-y divide-border/70 [&>*]:py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.appearance.language")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.appearance.languageDescription")}
                </p>
              </div>
              <div className="w-full sm:w-64 shrink-0">
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

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.appearance.mode")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.appearance.themeDescription")}
                </p>
              </div>
              <div className="w-full sm:w-64 shrink-0">
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

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5 flex-[5] min-w-[240px]">
                <Label>{t("settings.appearance.themeStyle")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.appearance.themeStyleDescription")}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/settings/space-theme", { replace: true })
                    }
                    className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    {t("settings.appearance.manageThemes")}
                  </button>
                </p>
              </div>
              <div className="w-full sm:w-64 shrink-0">
                <div className="relative">
                  <select
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full appearance-none bg-transparent font-normal"
                    )}
                    value={spaceTheme || "default"}
                    onChange={(e) => {
                      const val = e.target.value
                      applyTheme(val === "default" ? null : val)
                    }}
                  >
                    <option value="default">{t("theme.default")}</option>
                    {themes.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
                </div>
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* About Section */}
      <div className="pb-2 pt-5">
        <h3 className="text-[15px] font-medium">
          {t("settings.about", "About")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-0">
        <div className="divide-y divide-border/70 py-1">
          {/* Links */}
          {[
            {
              label: "GitHub",
              url: SETTINGS_EXTERNAL_LINKS.github,
              icon: <Github className="h-4 w-4" />,
              description: t("settings.about.github", "Source code and issues"),
            },
            {
              label: "Discord",
              url: SETTINGS_EXTERNAL_LINKS.discord,
              icon: <DiscordIcon className="h-4 w-4" />,
              description: t("settings.about.discord", "Join the community"),
            },
            {
              label: t("settings.about.website", "Website"),
              url: SETTINGS_EXTERNAL_LINKS.website,
              icon: <ExternalLink className="h-4 w-4" />,
              description: t(
                "settings.about.websiteDescription",
                "Official website"
              ),
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
            >
              <div className="text-muted-foreground">{link.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{link.label}</div>
                <div className="text-xs text-muted-foreground">
                  {link.description}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
