import { memo, useEffect, useRef, useState, useCallback } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"

import { cn, isDayPageId } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useShikiHighlight, getValidLanguage } from "@/hooks/use-shiki"

import remarkInternalLinks from "./remark-internal-links"
import { ChevronDownIcon, ChevronUpIcon, LinkIcon } from "lucide-react"

import "@/components/markdown-renderer/shiki-styles.css"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "llm-response": {
        language?: string
        title?: string
        children?: React.ReactNode
      }
    }
  }
}

// Shiki-powered code block component
interface ShikiCodeBlockProps {
  language: string
  children: string
  className?: string
  inline?: boolean
}

const ShikiCodeBlock = ({
  language,
  children,
  className = "",
  inline = false,
}: ShikiCodeBlockProps) => {
  const { highlightedHtml, isLoading } = useShikiHighlight(children, language)

  if (inline) {
    return (
      <code
        className={cn(
          "text-sm py-0.5 px-1 rounded-md",
          "bg-zinc-100 dark:bg-zinc-800",
          "group-data-[role=user]/message:bg-primary-foreground/20 group-data-[role=user]/message:text-primary-foreground",
          className
        )}
      >
        {children}
      </code>
    )
  }

  if (isLoading) {
    return (
      <pre
        className={cn(
          "w-[80dvw] md:max-w-[500px] overflow-x-scroll p-3 rounded-lg mt-2",
          "bg-zinc-100 dark:bg-zinc-800",
          "group-data-[role=user]/message:bg-primary-foreground/10 group-data-[role=user]/message:text-primary-foreground",
          className
        )}
      >
        <code>{children}</code>
      </pre>
    )
  }

  return (
    <div
      className={cn(
        "w-[80dvw] md:max-w-[500px] overflow-x-auto rounded-lg mt-2",
        className
      )}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  )
}

// LLM Response component with Shiki highlighting
const LLMResponseBlock = ({
  children,
  language = "markdown",
}: {
  children?: React.ReactNode
  language?: string
}) => {
  const codeContent = typeof children === "string" ? children : ""
  const { highlightedHtml, isLoading } = useShikiHighlight(
    codeContent,
    getValidLanguage(language)
  )

  return (
    <div
      className={cn(
        "border rounded-lg my-4",
        "border-zinc-200 dark:border-zinc-700",
        "group-data-[role=user]/message:border-primary-foreground/30"
      )}
    >
      {isLoading ? (
        <pre
          className={cn(
            "p-4 overflow-x-auto !m-0",
            "bg-zinc-50 dark:bg-zinc-900",
            "group-data-[role=user]/message:bg-primary-foreground/10 group-data-[role=user]/message:text-primary-foreground"
          )}
        >
          <code>{children}</code>
        </pre>
      ) : (
        <div
          className="overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      )}
    </div>
  )
}

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()

  const handleInternalLinkClick = (id: string) => {
    if (isDayPageId(id)) {
      navigate(`/journals/${id}`)
    } else {
      navigate(`/${id}`)
    }
  }

  const components: Partial<Components> = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "")
      const language = match?.[1]
      const [isCollapsed, setIsCollapsed] = useState(true)

      if (inline || !match) {
        // Provide better contrast for inline code in user messages
        return (
          <code
            className={cn(
              "text-sm py-0.5 px-1 rounded-md",
              // Default style (assistant message)
              "bg-zinc-100 dark:bg-zinc-800",
              // Style in user messages - use semi-transparent foreground as background
              "group-data-[role=user]/message:bg-primary-foreground/20 group-data-[role=user]/message:text-primary-foreground",
              className
            )}
            {...props}
          >
            {children}
          </code>
        )
      }

      const codeContent = String(children).replace(/\n$/, "")

      if (
        language === "javascript" ||
        language === "jsx" ||
        language === "tsx" ||
        language === "python"
      ) {
        const linesCount = codeContent.split("\n").length
        const filename =
          language === "python"
            ? "main.py"
            : language === "javascript"
              ? "index.js"
              : `index.${language}`
        return (
          <div
            className={cn(
              "border rounded-lg p-3 mt-2",
              // Default style
              "border-zinc-200 dark:border-zinc-700",
              // Style in user messages
              "group-data-[role=user]/message:border-primary-foreground/30"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 p-1 cursor-pointer rounded-md transition-colors",
                // Default hover style
                "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                // Hover style in user messages
                "group-data-[role=user]/message:hover:bg-primary-foreground/10"
              )}
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <span className="text-xs">{filename}</span>
              <span
                className={cn(
                  "text-xs",
                  // Default color
                  "text-green-600",
                  // Color in user messages
                  "group-data-[role=user]/message:text-primary-foreground/80"
                )}
              >
                +{linesCount}
              </span>
              <span
                className={cn(
                  "text-xs",
                  // Default color
                  "text-zinc-500 dark:text-zinc-400",
                  // Color in user messages
                  "group-data-[role=user]/message:text-primary-foreground/70"
                )}
              >
                lines
              </span>
              {isCollapsed ? (
                <ChevronDownIcon
                  className={cn(
                    "w-3.5 h-3.5 ml-auto",
                    "text-zinc-500",
                    "group-data-[role=user]/message:text-primary-foreground/70"
                  )}
                />
              ) : (
                <ChevronUpIcon
                  className={cn(
                    "w-3.5 h-3.5 ml-auto",
                    "text-zinc-500",
                    "group-data-[role=user]/message:text-primary-foreground/70"
                  )}
                />
              )}
            </div>
            <div className={isCollapsed ? "hidden" : ""}>
              <ShikiCodeBlock
                language={getValidLanguage(language)}
                className={cn(
                  "!m-0",
                  "group-data-[role=user]/message:bg-primary-foreground/10 group-data-[role=user]/message:text-primary-foreground"
                )}
              >
                {codeContent}
              </ShikiCodeBlock>
            </div>
          </div>
        )
      }

      return (
        <ShikiCodeBlock
          language={getValidLanguage(language)}
          className={cn(
            "w-[80dvw] md:max-w-[500px] overflow-x-scroll p-3 rounded-lg mt-2",
            "bg-zinc-100 dark:bg-zinc-800",
            "group-data-[role=user]/message:bg-primary-foreground/10 group-data-[role=user]/message:text-primary-foreground",
            className
          )}
        >
          {codeContent}
        </ShikiCodeBlock>
      )
    },
    "internal-link": ({
      node,
      "data-id": dataId,
      "data-title": dataTitle,
      ...props
    }: any) => {
      return (
        <Badge
          className="inline-flex items-center gap-1 px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity"
          title={`ID: ${dataId}`}
          onClick={() => {
            handleInternalLinkClick(dataId)
          }}
          {...props}
        >
          <LinkIcon className="w-3 h-3" />
          <span className="min-w-0 flex-1">{dataTitle}</span>
        </Badge>
      )
    },
    "llm-response": ({
      children,
      language = "markdown",
      title,
      ...props
    }: any) => {
      return <LLMResponseBlock language={language}>{children}</LLMResponseBlock>
    },
    ol: ({ node, children, ...props }: any) => {
      return (
        <ol className="list-decimal list-outside ml-4" {...props}>
          {children}
        </ol>
      )
    },
    li: ({ node, children, ...props }: any) => {
      return (
        <li className="py-1" {...props}>
          {children}
        </li>
      )
    },
    ul: ({ node, children, ...props }: any) => {
      return (
        <ul className="list-decimal list-outside ml-4" {...props}>
          {children}
        </ul>
      )
    },
    strong: ({ node, children, ...props }: any) => {
      return (
        <span className="font-semibold" {...props}>
          {children}
        </span>
      )
    },
    a: ({ node, children, ...props }: any) => {
      return (
        <a
          className={cn(
            "hover:underline",
            // Default color
            "text-blue-500",
            // Style in user messages - use brighter foreground color
            "group-data-[role=user]/message:text-primary-foreground group-data-[role=user]/message:opacity-90 group-data-[role=user]/message:hover:opacity-100"
          )}
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      )
    },
    h1: ({ node, children, ...props }: any) => {
      return (
        <h1
          className={cn(
            "text-3xl font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h1>
      )
    },
    h2: ({ node, children, ...props }: any) => {
      return (
        <h2
          className={cn(
            "text-2xl font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h2>
      )
    },
    h3: ({ node, children, ...props }: any) => {
      return (
        <h3
          className={cn(
            "text-xl font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h3>
      )
    },
    h4: ({ node, children, ...props }: any) => {
      return (
        <h4
          className={cn(
            "text-lg font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h4>
      )
    },
    h5: ({ node, children, ...props }: any) => {
      return (
        <h5
          className={cn(
            "text-base font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h5>
      )
    },
    h6: ({ node, children, ...props }: any) => {
      return (
        <h6
          className={cn(
            "text-sm font-semibold mt-6 mb-2",
            "group-data-[role=user]/message:text-primary-foreground"
          )}
          {...props}
        >
          {children}
        </h6>
      )
    },
  } as any

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkInternalLinks]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  )
}

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
)

export default Markdown
