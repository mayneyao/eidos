import { useEffect, useMemo, useState } from "react"
import { PlusCircle, TelescopeIcon, Trash2 } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "react-i18next"

import { useThemeStore } from "@/apps/web-app/store/theme-store"
import {
  handleApplyTheme,
  presetThemes as themes,
} from "@/apps/web-app/hooks/use-apply-theme-by-name"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import defaultTheme from "@/styles/themes/default.css?raw"

interface ThemeFormData {
  name: string
  css: string
}

export function ThemeStudio() {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()
  const {
    setCurrentThemeName,
    currentThemeName,
    addCustomTheme,
    customThemes,
    removeCustomTheme,
  } = useThemeStore()

  const allThemes = useMemo(() => {
    return [...themes, ...(customThemes || [])]
  }, [customThemes])

  const [selectedThemeIndex, setSelectedThemeIndex] = useState(
    allThemes.findIndex((t) => t.name === currentThemeName)
  )
  const [isAddingTheme, setIsAddingTheme] = useState(false)
  const [formData, setFormData] = useState<ThemeFormData>({
    name: "",
    css: defaultTheme,
  })

  const isDarkMode = resolvedTheme === "dark"

  // Handle keyboard navigation
  useEffect(() => {
    if (isAddingTheme) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedThemeIndex((prev) =>
          prev > 0 ? prev - 1 : allThemes.length - 1
        )
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedThemeIndex((prev) =>
          prev < allThemes.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === "Enter") {
        handleSelectTheme(allThemes[selectedThemeIndex].name)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedThemeIndex, isAddingTheme])

  const handleSelectTheme = (selectedTheme: string) => {
    const theme = allThemes.find((t) => t.name === selectedTheme)
    if (theme) {
      handleApplyTheme(theme.css, isDarkMode)
      setCurrentThemeName(theme.name)
    }
  }

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      setError(t("theme.error.nameRequired", "Theme name is required"))
      return
    }
    if (!formData.css.trim()) {
      setError(t("theme.error.cssRequired", "CSS is required"))
      return
    }

    try {
      // TODO: Add theme to the themes list
      handleApplyTheme(formData.css, isDarkMode)
      setCurrentThemeName(formData.name)
      setIsAddingTheme(false)
      addCustomTheme({
        name: formData.name,
        css: formData.css,
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply theme")
    }
  }

  const handleDeleteTheme = (themeName: string) => {
    if (currentThemeName === themeName) {
      // If deleting current theme, switch to default theme
      handleSelectTheme("Default")
    }
    removeCustomTheme(themeName)
  }

  return (
    <div className="flex min-h-[450px] divide-x">
      {/* Left side - Theme List */}
      <div className="w-1/3 p-2 flex flex-col">
        <div className="flex flex-col gap-1 flex-1">
          {allThemes.map((theme, index) => (
            <div key={theme.name} className="flex items-center gap-2 group">
              <button
                onClick={() => {
                  if (isAddingTheme) return
                  setSelectedThemeIndex(index)
                  handleSelectTheme(theme.name)
                }}
                className={`flex flex-1 items-center px-3 py-1.5 rounded-md text-left transition-colors
                  ${
                    selectedThemeIndex === index && !isAddingTheme
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
              >
                <span className="text-sm">{theme.name}</span>
              </button>
              {customThemes?.some((ct) => ct.name === theme.name) && (
                <button
                  onClick={() => handleDeleteTheme(theme.name)}
                  className={`p-1 rounded-md hover:bg-destructive/10 hover:text-destructive opacity-0 
                    ${selectedThemeIndex === index && !isAddingTheme ? "opacity-100" : "group-hover:opacity-100"} 
                    transition-opacity`}
                  title={t("theme.delete", "Delete theme")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`w-full justify-start gap-2 ${
            isAddingTheme ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => setIsAddingTheme(!isAddingTheme)}
        >
          <PlusCircle className="h-4 w-4" />
          <span>{isAddingTheme ? t("common.cancel") : t("common.add")}</span>
        </Button>
      </div>

      {/* Right side - Preview/Edit Area */}
      <div className="w-2/3 p-2 flex flex-col">
        {isAddingTheme ? (
          // Theme Edit Form
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="theme-name">
                {t("theme.name", "Theme Name")}
              </Label>
              <Input
                id="theme-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={t("theme.namePlaceholder", "theme name")}
              />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex justify-between">
                <Label htmlFor="theme-css">CSS</Label>
                <a href="https://tweakcn.com/" target="_blank">
                  <TelescopeIcon className="h-4 w-4" />
                </a>
              </div>
              <Textarea
                id="theme-css"
                value={formData.css}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, css: e.target.value }))
                }
                className="min-h-[300px] font-mono text-sm"
                placeholder={t("theme.cssPlaceholder", "Enter theme CSS")}
              />
            </div>
            <Button onClick={handleSubmit} className="w-full">
              {t("common.submit", "Submit")}
            </Button>
          </div>
        ) : (
          // Theme Preview
          <div className="flex-1 rounded-lg border p-3">
            <div className="space-y-2">
              <div className="h-6 w-full rounded bg-primary" />
              <div className="h-6 w-full rounded bg-secondary" />
              <div className="h-6 w-full rounded bg-accent" />
              <div className="flex gap-2 mt-2">
                <button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm">
                  Primary Button
                </button>
                <button className="rounded-md bg-secondary px-3 py-1.5 text-secondary-foreground text-sm">
                  Secondary Button
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
