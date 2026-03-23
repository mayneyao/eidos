"use client"

import { useEffect, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

interface ThemeReadmeProps {
  repo: string
  className?: string
  fallbackDescription?: string
}

export function ThemeReadme({
  repo,
  className,
  fallbackDescription,
}: ThemeReadmeProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repo) {
      setContent("")
      return
    }

    const fetchReadme = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const branches = ["main", "master"]
        let readmeContent = ""

        for (const branch of branches) {
          const url = `https://raw.githubusercontent.com/${repo}/${branch}/README.md`
          try {
            const response = await fetch(url)
            if (response.ok) {
              readmeContent = await response.text()
              break
            }
          } catch {
            continue
          }
        }

        if (readmeContent) {
          setContent(readmeContent)
        } else {
          setError(t("theme.noReadme", "No documentation provided."))
        }
      } catch (err) {
        setError(t("theme.readmeError", "Failed to load documentation."))
      } finally {
        setIsLoading(false)
      }
    }

    fetchReadme()
  }, [repo, t])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground animate-pulse">
          {t("common.loading", "Loading...")}
        </p>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className={cn("text-sm text-muted-foreground py-4", className)}>
        {error ? (
          <div className="flex items-center gap-2 text-destructive/80 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <p>
            {fallbackDescription ||
              t("theme.noReadme", "No additional documentation available.")}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5",
        "prose-pre:bg-muted prose-pre:rounded-lg",
        "prose-img:rounded-lg prose-img:border",
        "prose-hr:border-border",
        "prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
