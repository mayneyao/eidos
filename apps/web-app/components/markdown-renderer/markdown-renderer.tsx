import { useCallback, useEffect, useRef } from "react"
import Prism from "prismjs"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// Import Prism theme and language support
import "prismjs/themes/prism-tomorrow.css"
import "./prism-custom.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-javascript"
import "prismjs/components/prism-jsx"
import "prismjs/components/prism-tsx"
import "prismjs/components/prism-python"
import "prismjs/components/prism-sql"
import "prismjs/components/prism-bash"
import "prismjs/components/prism-json"
import "prismjs/components/prism-markdown"
import "prismjs/components/prism-css"
import "prismjs/components/prism-yaml"

interface MarkdownRendererProps {
  children: string
  className?: string
  enableGfm?: boolean
  customComponents?: Partial<Components>
}

export const MarkdownRenderer = ({
  children,
  className = "",
  enableGfm = true,
  customComponents = {},
}: MarkdownRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null)

  const rehighlight = useCallback(() => {
    if (containerRef.current) {
      // Use highlightAllUnder for more targeted highlighting
      Prism.highlightAllUnder(containerRef.current)
    } else {
      // Fallback to highlightAll if ref is not available
      Prism.highlightAll()
    }
  }, [])

  useEffect(() => {
    // Use setTimeout to ensure DOM is fully rendered before highlighting
    const timer = setTimeout(rehighlight, 0)
    return () => clearTimeout(timer)
  }, [children, rehighlight])

  // Additional effect to ensure highlighting after component mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        // Find all code elements and manually highlight them
        const codeElements = containerRef.current.querySelectorAll(
          'code[class*="language-"]'
        )
        codeElements.forEach((element) => {
          Prism.highlightElement(element)
        })
      }
    }, 100) // Slightly longer delay for mount

    return () => clearTimeout(timer)
  }, [])

  // 监听容器大小变化，重新触发高亮
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }

      resizeTimerRef.current = setTimeout(() => {
        rehighlight()
        resizeTimerRef.current = null
      }, 100)
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [rehighlight])

  // Helper function to get valid language for Prism
  const getValidLanguage = (lang: string): string => {
    if (!lang) return "plaintext"

    // Common language mappings
    const languageMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      py: "python",
      sh: "bash",
      shell: "bash",
      yml: "yaml",
      html: "markup",
      xml: "markup",
    }

    const normalizedLang = lang.toLowerCase()
    return languageMap[normalizedLang] || normalizedLang
  }

  // Default components for ReactMarkdown to support code highlighting
  const defaultComponents: Partial<Components> = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "")
      const language = match?.[1] || ""

      if (inline) {
        return (
          <code
            className="text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md font-mono"
            {...props}
          >
            {children}
          </code>
        )
      }

      // For block code, use proper language or fallback to plaintext
      const validLanguage = getValidLanguage(language)
      const codeClassName = `language-${validLanguage}`

      return (
        <pre
          className="w-full overflow-x-auto bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg mt-2 mb-2"
          {...props}
        >
          <code
            className={`${codeClassName} font-mono text-sm`}
            data-language={validLanguage}
          >
            {children}
          </code>
        </pre>
      )
    },
    pre: ({ children, ...props }) => {
      // Prevent double wrapping of pre tags
      return <>{children}</>
    },
    h1: ({ children, ...props }) => (
      <h1 className="text-2xl font-bold mt-6 mb-4 first:mt-0" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="text-xl font-semibold mt-5 mb-3 first:mt-0" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-lg font-medium mt-4 mb-2 first:mt-0" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="mb-3 leading-relaxed" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="list-disc list-inside mb-3 space-y-1" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal list-inside mb-3 space-y-1" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 my-4 italic text-zinc-600 dark:text-zinc-400"
        {...props}
      >
        {children}
      </blockquote>
    ),
    a: ({ children, ...props }) => (
      <a
        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
        {...props}
      >
        {children}
      </a>
    ),
    strong: ({ children, ...props }) => (
      <strong className="font-semibold" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em className="italic" {...props}>
        {children}
      </em>
    ),
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table
          className="min-w-full border-collapse border border-zinc-300 dark:border-zinc-600"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th
        className="border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-left font-medium"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        className="border border-zinc-300 dark:border-zinc-600 px-4 py-2"
        {...props}
      >
        {children}
      </td>
    ),
  }

  // Merge default components with custom components
  const components = { ...defaultComponents, ...customComponents }

  const plugins = enableGfm ? [remarkGfm] : []

  return (
    <div
      className={`prose prose-zinc dark:prose-invert max-w-none ${className}`}
      ref={containerRef}
    >
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
