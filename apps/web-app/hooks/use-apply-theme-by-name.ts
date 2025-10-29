import { useThemeStore } from "@/apps/web-app/store/theme-store"
import {
    parseCSSVariables,
    setThemeVariables
} from '@/lib/web/theme'
import retroArcade from "@/styles/themes/retro-arcade.css?raw"
import defaultTheme from "@/styles/themes/default.css?raw"
import { useTheme } from "next-themes"
import { useCallback, useEffect } from "react"
import { useAllThemes } from "./use-all-themes"
import { useSqliteKV } from "./use-sqlite-kv"

export const presetThemes = [
    {
        name: "Default",
        css: defaultTheme,
    },
    {
        name: "Retro Arcade",
        css: retroArcade,
    },
]



export const handleApplyTheme = (rawCss: string, isDarkMode: boolean) => {
    try {
        // Parse both light and dark mode variables
        const lightMatch = /:root\s*{([^}]+)}/.exec(rawCss)
        const darkMatch = /\.dark\s*{([^}]+)}/.exec(rawCss)
        if (!lightMatch && !darkMatch) {
            throw new Error(
                "No valid theme definitions found. Please ensure your CSS includes both :root {...} and .dark {...} blocks."
            )
        }
        if (isDarkMode) {
            if (darkMatch) {
                const darkVariables = parseCSSVariables(darkMatch[1])
                setThemeVariables(darkVariables)
            }
        } else if (lightMatch) {
            const lightVariables = parseCSSVariables(lightMatch[1])
            setThemeVariables(lightVariables)
        }
    } catch (err) {
    }
}

export const useApplyThemeByName = () => {
    const { currentThemeName } = useThemeStore()
    const { theme = "light" } = useTheme()
    const allThemes = useAllThemes()
    const [themeMode, setThemeMode] = useSqliteKV<string>('eidos:space:settings:theme:mode', 'light')
    const applyTheme = useCallback((mode: string, themeName: string) => {
        const currentThemeName = allThemes.find(t => t.name === themeName)
        if (currentThemeName) {
            handleApplyTheme(currentThemeName.css, mode === "dark")
        }
    }, [allThemes])

    const applyDarkModeSwitch = useCallback((theme: string) => {
        applyTheme(theme, currentThemeName)
    }, [applyTheme, currentThemeName])

    useEffect(() => {
        applyTheme(theme, currentThemeName)
        setThemeMode(theme)
    }, [currentThemeName, theme])

    return {
        applyTheme,
        applyDarkModeSwitch
    }
}