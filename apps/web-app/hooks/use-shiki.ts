import { useEffect, useRef, useState, useCallback } from "react"
import type { HighlighterCore, LanguageRegistration } from "shiki"
import { createHighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"

// Only import commonly used languages to keep bundle size reasonable
// Using @shikijs/langs directly for better TypeScript support
import javascript from "@shikijs/langs/javascript"
import typescript from "@shikijs/langs/typescript"
import tsx from "@shikijs/langs/tsx"
import jsx from "@shikijs/langs/jsx"
import python from "@shikijs/langs/python"
import bash from "@shikijs/langs/bash"
import json from "@shikijs/langs/json"
import markdown from "@shikijs/langs/markdown"
import css from "@shikijs/langs/css"
import yaml from "@shikijs/langs/yaml"
import html from "@shikijs/langs/html"
import sql from "@shikijs/langs/sql"

// Import themes from @shikijs/themes
import githubDark from "@shikijs/themes/github-dark"
import githubLight from "@shikijs/themes/github-light"

// Map of available languages (langs are arrays, so we flatten them)
const bundledLanguages: Record<string, LanguageRegistration[]> = {
  javascript,
  typescript,
  tsx,
  jsx,
  python,
  bash,
  json,
  markdown,
  css,
  yaml,
  html,
  sql,
}

// Get all languages as a flat array for initial load
const allLanguages = Object.values(bundledLanguages).flat()

// Shiki highlighter singleton
let highlighterPromise: Promise<HighlighterCore> | null = null

const getHighlighter = async () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: allLanguages,
      engine: createOnigurumaEngine(() => import("shiki/wasm")),
    })
  }
  return highlighterPromise
}

// Language mapping for common aliases
const languageMap: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  xml: "html",
  plaintext: "text",
  text: "text",
}

export const getValidLanguage = (lang: string | undefined): string => {
  if (!lang) return "text"
  const normalizedLang = lang.toLowerCase()
  return languageMap[normalizedLang] || normalizedLang
}

export interface UseShikiOptions {
  /**
   * Theme to use for highlighting
   * @default "github-dark"
   */
  theme?: "github-dark" | "github-light"
}

/**
 * Hook to highlight code using Shiki
 * Returns the highlighted HTML string
 */
export const useShikiHighlight = (
  code: string,
  language: string,
  options: UseShikiOptions = {}
) => {
  const { theme = "github-dark" } = options
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const highlight = async () => {
      setIsLoading(true)
      try {
        const highlighter = await getHighlighter()
        const validLang = getValidLanguage(language)

        // Check if language is bundled
        const langToUse = bundledLanguages[validLang] ? validLang : "text"

        const html = highlighter.codeToHtml(code, {
          lang: langToUse,
          theme,
        })

        if (isMounted) {
          setHighlightedHtml(html)
        }
      } catch (error) {
        console.error("Shiki highlighting error:", error)
        // Fallback to plain text with escaping
        if (isMounted) {
          setHighlightedHtml(
            `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    highlight()

    return () => {
      isMounted = false
    }
  }, [code, language, theme])

  return { highlightedHtml, isLoading }
}

/**
 * Hook to highlight all code blocks under a container element
 */
export const useShikiHighlighter = (options: UseShikiOptions = {}) => {
  const { theme = "github-dark" } = options
  const highlighterRef = useRef<HighlighterCore | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    getHighlighter().then((highlighter) => {
      highlighterRef.current = highlighter
      setIsReady(true)
    })
  }, [])

  const highlightElement = useCallback(
    async (element: HTMLElement) => {
      if (!highlighterRef.current) return
      const highlighter = highlighterRef.current

      const codeElements = element.querySelectorAll('code[class*="language-"]')

      for (const codeEl of Array.from(codeElements)) {
        const code = codeEl.textContent || ""
        const className = codeEl.className
        const match = /language-(\w+)/.exec(className)
        const lang = match?.[1] || "text"
        const validLang = getValidLanguage(lang)

        // Check if language is bundled
        const langToUse = bundledLanguages[validLang] ? validLang : "text"

        try {
          const html = highlighter.codeToHtml(code, {
            lang: langToUse,
            theme,
          })
          // Replace the code element's parent pre with the highlighted HTML
          const wrapper = document.createElement("div")
          wrapper.innerHTML = html
          const preElement = wrapper.querySelector("pre")
          if (preElement && codeEl.parentElement) {
            codeEl.parentElement.replaceWith(preElement)
          }
        } catch (error) {
          console.error("Failed to highlight element:", error)
        }
      }
    },
    [theme]
  )

  const highlightAllUnder = useCallback(
    async (container: HTMLElement | null) => {
      if (!container || !highlighterRef.current) return
      await highlightElement(container)
    },
    [highlightElement]
  )

  return { highlightAllUnder, highlightElement, isReady }
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

export default useShikiHighlighter
