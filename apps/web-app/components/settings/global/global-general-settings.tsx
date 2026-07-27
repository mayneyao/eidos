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

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

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
    <div className="space-y-8">
      {/* App Section */}
      <SettingsSection title={t("settings.general.app")}>
        <SettingsRows>
          {/* Current Version */}
          <SettingsRow
            title={t("settings.general.currentVersion")}
            description={
              <>
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
              </>
            }
          >
            <div className="text-sm font-mono text-muted-foreground">
              v{EIDOS_VERSION}
              {EIDOS_COMMIT && ` (${EIDOS_COMMIT})`}
            </div>
          </SettingsRow>

          {/* Check for Updates */}
          {isDesktopMode && (
            <SettingsRow
              title={t("settings.general.checkForUpdates")}
              description={
                <>
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
                </>
              }
            >
              <div className="flex items-center gap-2">
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
            </SettingsRow>
          )}

          {/* Auto Update */}
          {isDesktop && (
            <SettingsRow
              htmlFor="auto-update"
              title={t("settings.general.enableAutoUpdate")}
              description={t("settings.general.enableAutoUpdateDescription")}
            >
              <Switch
                id="auto-update"
                checked={autoUpdateEnabled}
                onCheckedChange={handleToggleAutoUpdate}
                disabled={isLoadingConfig}
              />
            </SettingsRow>
          )}

          {/* Update Channel */}
          {isDesktop && (
            <SettingsRow
              htmlFor="update-channel"
              title={t("settings.general.updateChannel")}
              description={t("settings.general.updateChannelDescription")}
              controlClassName="w-64 max-w-full"
            >
              <div className="relative">
                <select
                  id="update-channel"
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
                  <option value="stable">{t("settings.general.stable")}</option>
                  <option value="beta">{t("settings.general.beta")}</option>
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
              </div>
            </SettingsRow>
          )}
        </SettingsRows>
      </SettingsSection>

      {/* Appearance Section */}
      <SettingsSection title={t("settings.appearance.title")}>
        <Form {...appearanceForm}>
          <form>
            <SettingsRows>
              <SettingsRow
                htmlFor="language"
                title={t("settings.appearance.language")}
                description={t("settings.appearance.languageDescription")}
                controlClassName="w-64 max-w-full"
              >
                <FormField
                  control={appearanceForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <div className="relative">
                        <FormControl>
                          <select
                            id="language"
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
              </SettingsRow>

              <SettingsRow
                title={t("settings.appearance.mode")}
                description={t("settings.appearance.themeDescription")}
                controlClassName="w-64 max-w-full"
              >
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
              </SettingsRow>

              <SettingsRow
                htmlFor="theme-style"
                title={t("settings.appearance.themeStyle")}
                description={
                  <>
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
                  </>
                }
                controlClassName="w-64 max-w-full"
              >
                <div className="relative">
                  <select
                    id="theme-style"
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
              </SettingsRow>
            </SettingsRows>
          </form>
        </Form>
      </SettingsSection>

      {/* About Section */}
      <SettingsSection title={t("settings.about", "About")}>
        <SettingsRows>
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
              className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="text-muted-foreground">{link.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{link.label}</div>
                <div className="text-sm text-muted-foreground">
                  {link.description}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
