import { useEffect, useRef, useState, useCallback } from "react"
import { createHighlighter, type Highlighter } from "shiki"

// Shiki highlighter singleton
let highlighterPromise: Promise<Highlighter> | null = null

const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [
        "javascript",
        "typescript",
        "jsx",
        "tsx",
        "python",
        "sql",
        "bash",
        "json",
        "markdown",
        "css",
        "yaml",
        "html",
        "mermaid",
      ],
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
  html: "html",
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

        // Check if language is supported, fallback to text if not
        const supportedLangs = highlighter.getLoadedLanguages()
        const langToUse = supportedLangs.includes(validLang as any)
          ? validLang
          : "text"

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
 * Similar to Prism.highlightAllUnder
 */
export const useShikiHighlighter = (options: UseShikiOptions = {}) => {
  const { theme = "github-dark" } = options
  const highlighterRef = useRef<Highlighter | null>(null)
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

      const codeElements = element.querySelectorAll('code[class*="language-"]')

      codeElements.forEach((codeEl) => {
        const code = codeEl.textContent || ""
        const className = codeEl.className
        const match = /language-(\w+)/.exec(className)
        const lang = match?.[1] || "text"
        const validLang = getValidLanguage(lang)

        const supportedLangs = highlighterRef.current!.getLoadedLanguages()
        const langToUse = supportedLangs.includes(validLang as any)
          ? validLang
          : "text"

        try {
          const html = highlighterRef.current!.codeToHtml(code, {
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
      })
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
