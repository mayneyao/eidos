"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Palette,
  Search,
  Trash2,
  ChevronRight,
  Globe,
  WifiOff,
  RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { ThemeReadme } from "./theme-readme"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { useSpaceTheme } from "@/apps/web-app/hooks/use-space-theme"
import type { ThemeWithStatus } from "@/apps/web-app/hooks/use-theme-market"
import { useThemeMarket } from "@/apps/web-app/hooks/use-theme-market"
import { cn } from "@/lib/utils"

// Compact Theme Thumbnail
interface ThemeThumbnailProps {
  name: string
  repo?: string
  screenshot?: string
  fallbackColors: string[]
  className?: string
  size?: "sm" | "lg"
}

function ThemeThumbnail({
  name,
  repo,
  screenshot,
  fallbackColors,
  className,
  size = "sm",
}: ThemeThumbnailProps) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const imageUrl = useMemo(() => {
    if (!repo || !screenshot) return null
    return `https://raw.githubusercontent.com/${repo}/main/${screenshot}`
  }, [repo, screenshot])

  if (!imageUrl || imageError) {
    return (
      <div className={cn("flex rounded overflow-hidden bg-muted", className)}>
        {fallbackColors.map((color, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative rounded overflow-hidden bg-muted border border-border/50",
        className
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={name}
        className={cn(
          "h-full w-full object-contain transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100"
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => setImageError(true)}
      />
    </div>
  )
}

export function ThemeSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const {
    currentTheme,
    themes: installedThemes,
    applyTheme,
    installTheme,
    uninstallTheme,
    refreshThemes,
    getThemeColors,
  } = useSpaceTheme()

  // Cache for theme preview colors
  const [themeColorsMap, setThemeColorsMap] = useState<Map<string, string[]>>(
    new Map()
  )
  const {
    themes: marketThemes,
    isLoading: isMarketLoading,
    error: marketError,
    refresh: refreshMarket,
    downloadTheme,
  } = useThemeMarket()

  useEffect(() => {
    refreshThemes()
  }, [refreshThemes])

  const [searchQuery, setSearchQuery] = useState("")
  const [showInstalledOnly, setShowInstalledOnly] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<ThemeWithStatus | null>(
    null
  )
  const [installing, setInstalling] = useState<string | null>(null)

  // Async load theme colors when themes change
  useEffect(() => {
    const loadColors = async () => {
      const newColorsMap = new Map<string, string[]>()
      const colorsPromises = installedThemes.map(async (name) => {
        const colors = await getThemeColors(name)
        return { name, colors }
      })

      const results = await Promise.all(colorsPromises)
      for (const { name, colors } of results) {
        newColorsMap.set(name, colors)
      }

      setThemeColorsMap(newColorsMap)
    }

    loadColors()
  }, [installedThemes, getThemeColors])

  const allThemes = useMemo<ThemeWithStatus[]>(() => {
    const installedSet = new Set(installedThemes)
    const merged: ThemeWithStatus[] = marketThemes.map((theme) => ({
      ...theme,
      isInstalled: installedSet.has(theme.name),
      isActive: currentTheme === theme.name,
    }))

    const marketNames = new Set(marketThemes.map((t) => t.name))
    for (const name of installedThemes) {
      if (!marketNames.has(name)) {
        merged.push({
          name,
          author: t("theme.local", "Local"),
          repo: "",
          screenshot: "",
          modes: ["light", "dark"],
          isInstalled: true,
          isActive: currentTheme === name,
          isLocal: true,
        })
      }
    }
    return merged
  }, [marketThemes, installedThemes, currentTheme, t])

  const filteredThemes = useMemo(() => {
    let result = allThemes
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (theme) =>
          theme.name.toLowerCase().includes(q) ||
          theme.author.toLowerCase().includes(q)
      )
    }
    if (showInstalledOnly) {
      result = result.filter((theme) => theme.isInstalled)
    }
    return result
  }, [allThemes, searchQuery, showInstalledOnly])

  const handleInstall = async (theme: ThemeWithStatus) => {
    if (theme.isLocal || !theme.repo) return
    setInstalling(theme.name)
    try {
      const css = await downloadTheme(theme.repo)
      if (!css) return
      await installTheme(theme.name, css)
      toast({
        title: t("theme.installed", "Theme installed"),
        description: theme.name,
      })
      setSelectedTheme((prev) => (prev ? { ...prev, isInstalled: true } : null))
    } catch (error) {
      toast({
        title: t("theme.installError", "Failed to install theme"),
        variant: "destructive",
      })
    } finally {
      setInstalling(null)
    }
  }

  const handleUninstall = async (name: string) => {
    await uninstallTheme(name)
    toast({
      title: t("theme.uninstalled", "Theme uninstalled"),
      description: name,
    })
    setSelectedTheme((prev) =>
      prev?.name === name
        ? { ...prev, isInstalled: false, isActive: false }
        : prev
    )
  }

  const handleApply = async (name: string | null) => {
    await applyTheme(name)
    setSelectedTheme((prev) => (prev ? { ...prev, isActive: true } : null))
  }

  const getPreviewColors = (name: string): string[] => {
    // Return cached colors if available
    if (themeColorsMap.has(name)) {
      return themeColorsMap.get(name)!
    }
    // Return default colors for default theme
    if (name === t("theme.default", "Default")) {
      return ["#18181b", "#27272a", "#52525b"]
    }
    // Fallback to name-based colors while loading
    const hash = name
      .split("")
      .reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)
    const colors = []
    for (let i = 0; i < 3; i++) {
      const hue = (hash + i * 60) % 360
      colors.push(`hsl(${hue} 45% 60%)`)
    }
    return colors
  }

  const isDefaultSelected =
    selectedTheme?.name === t("theme.default", "Default")

  // Detail View
  if (selectedTheme) {
    return (
      <div className="space-y-0 animate-in fade-in slide-in-from-right-2 duration-200">
        <div className="py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedTheme(null)}
            className="h-8 w-8 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium truncate">
              {selectedTheme.name}
            </h3>
          </div>
        </div>
        <hr className="border-border" />

        <div className="py-6 space-y-8">
          {/* Main Preview Container */}
          <div className="space-y-6">
            <div className="aspect-video rounded-xl border border-border overflow-hidden bg-muted/30 relative flex items-center justify-center">
              {isDefaultSelected ? (
                <div className="flex h-full w-full">
                  <div className="flex-1 bg-[#18181b]" />
                  <div className="flex-1 bg-[#27272a]" />
                  <div className="flex-1 bg-[#52525b]" />
                </div>
              ) : (
                <ThemeThumbnail
                  name={selectedTheme.name}
                  repo={selectedTheme.repo}
                  screenshot={selectedTheme.screenshot}
                  fallbackColors={getPreviewColors(selectedTheme.name)}
                  className="w-full h-full"
                />
              )}
            </div>

            {/* Actions & Info Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 rounded-xl border bg-muted/10">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    {t("theme.author", "Author")}
                  </span>
                  <span className="text-sm font-semibold">
                    {selectedTheme.author}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTheme.modes.map((mode) => (
                    <Badge
                      key={mode}
                      variant="secondary"
                      className="text-[10px] uppercase font-bold tracking-tight py-0"
                    >
                      {mode}
                    </Badge>
                  ))}
                  {selectedTheme.isInstalled && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-bold tracking-tight py-0 border-primary/30 text-primary bg-primary/5"
                    >
                      Installed
                    </Badge>
                  )}
                  {selectedTheme.isActive && (
                    <Badge
                      variant="default"
                      className="text-[10px] uppercase font-bold tracking-tight py-0"
                    >
                      {t("theme.active", "Active")}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                {/* Secondary Actions Row */}
                <div className="flex gap-2">
                  {selectedTheme.repo && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-9 px-3"
                    >
                      <a
                        href={`https://github.com/${selectedTheme.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        GitHub
                      </a>
                    </Button>
                  )}
                  {selectedTheme.isInstalled && !isDefaultSelected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-destructive hover:bg-destructive/10"
                      onClick={() => handleUninstall(selectedTheme.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                {/* Primary Action Button */}
                {!selectedTheme.isInstalled ? (
                  <Button
                    onClick={() => handleInstall(selectedTheme)}
                    disabled={installing === selectedTheme.name}
                    size="sm"
                    className="h-9 w-full sm:w-auto px-6 font-semibold"
                  >
                    {installing === selectedTheme.name ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("theme.installing", "Installing...")}
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        {t("theme.install", "Install")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant={selectedTheme.isActive ? "outline" : "default"}
                    onClick={() =>
                      handleApply(isDefaultSelected ? null : selectedTheme.name)
                    }
                    disabled={selectedTheme.isActive}
                    size="sm"
                    className={cn(
                      "h-9 w-full sm:w-auto px-6 font-semibold transition-all",
                      !selectedTheme.isActive &&
                        "shadow-md shadow-primary/20 hover:scale-[1.02]"
                    )}
                  >
                    {selectedTheme.isActive ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
                        {t("theme.applied", "Current")}
                      </>
                    ) : (
                      t("theme.apply", "Apply Theme")
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                {t("theme.about", "About")}
              </h4>
            </div>
            <div className="border rounded-xl px-6 py-6 border-border/50 bg-muted/5 min-h-[100px]">
              <ThemeReadme
                repo={selectedTheme.repo}
                fallbackDescription={
                  isDefaultSelected
                    ? t(
                        "theme.defaultDescription",
                        "The default Eidos experience. Reliable, clean, and optimized."
                      )
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List View
  return (
    <div className="space-y-0 animate-in fade-in duration-200">
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t("theme.title", "Themes")}</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="installed-only"
              checked={showInstalledOnly}
              onCheckedChange={setShowInstalledOnly}
            />
            <Label
              htmlFor="installed-only"
              className="cursor-pointer text-sm font-medium whitespace-nowrap"
            >
              {t("theme.showInstalledOnly", "Installed")}
            </Label>
          </div>

          <div className="relative w-full sm:w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("theme.searchPlaceholder", "Search...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/20 border-border/50"
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      <div className="py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "theme.description",
            "Customize your workspace appearance with curated themes."
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Default Theme Card */}
          {(showInstalledOnly || !searchQuery) && (
            <div
              onClick={() =>
                setSelectedTheme({
                  name: t("theme.default", "Default"),
                  author: "Eidos",
                  repo: "",
                  screenshot: "",
                  modes: ["light", "dark"],
                  isInstalled: true,
                  isActive: !currentTheme,
                  isLocal: true,
                })
              }
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer group transition-all",
                !currentTheme
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="w-16 h-12 rounded-lg overflow-hidden flex shrink-0 group-hover:scale-[1.05] transition-transform">
                <div className="flex-1 bg-zinc-950" />
                <div className="flex-1 bg-zinc-900" />
                <div className="flex-1 bg-zinc-800" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-semibold text-sm truncate leading-none">
                    {t("theme.default", "Default")}
                  </h4>
                  {!currentTheme && (
                    <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate uppercase font-medium tracking-tight mt-1">
                  Eidos
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
          )}

          {/* Market Themes */}
          {filteredThemes.map((theme) => (
            <div
              key={theme.name}
              onClick={() => setSelectedTheme(theme)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer group transition-all",
                theme.isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/50"
              )}
            >
              <ThemeThumbnail
                name={theme.name}
                repo={theme.repo}
                screenshot={theme.screenshot}
                fallbackColors={getPreviewColors(theme.name)}
                className="w-16 h-12 shrink-0 group-hover:scale-[1.05] transition-transform"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-semibold text-sm truncate leading-none">
                    {theme.name}
                  </h4>
                  {theme.isActive && (
                    <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate uppercase font-medium tracking-tight mt-1">
                  {theme.author}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {theme.isInstalled && !theme.isActive && (
                  <Badge
                    variant="secondary"
                    className="px-1 py-0 h-4 text-[9px] font-bold uppercase"
                  >
                    Ready
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}

          {/* Loading State */}
          {isMarketLoading && marketThemes.length === 0 && (
            <>
              {/* Skeleton cards for loading state */}
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={`skeleton-${i}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/10"
                >
                  <div className="w-16 h-12 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 bg-muted animate-pulse rounded w-24" />
                    <div className="h-3 bg-muted animate-pulse rounded w-16" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                </div>
              ))}
            </>
          )}

          {/* Error State */}
          {marketError && !isMarketLoading && (
            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl bg-muted/5">
              <WifiOff className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm font-medium mb-1">
                {t("theme.loadError", "Failed to load theme market")}
              </p>
              <p className="text-muted-foreground/60 text-xs mb-4">
                {t(
                  "theme.checkNetwork",
                  "Please check your network connection"
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshMarket}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("theme.retry", "Retry")}
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!isMarketLoading && !marketError && filteredThemes.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed rounded-xl bg-muted/5">
              <Palette className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                {t("theme.noThemes", "Find your style - No themes found.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
