import { useEffect, useRef, useState, useCallback } from "react"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useShikiHighlight, getValidLanguage } from "@/hooks/use-shiki"

// Shiki styles
import "./shiki-styles.css"

interface CodeBlockProps {
  language: string
  children: string
  className?: string
}

// Separate component for code blocks to use Shiki highlighting
const ShikiCodeBlock = ({
  language,
  children,
  className = "",
  ...props
}: CodeBlockProps & React.HTMLAttributes<HTMLPreElement>) => {
  const { highlightedHtml, isLoading } = useShikiHighlight(children, language)

  if (isLoading) {
    return (
      <pre
        className={`w-full overflow-x-auto bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg mt-2 mb-2 ${className}`}
        {...props}
      >
        <code className="font-mono text-sm">{children}</code>
      </pre>
    )
  }

  return (
    <div
      className={`w-full overflow-x-auto rounded-lg mt-2 mb-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  )
}

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

      // For block code, use Shiki highlighting
      const validLanguage = getValidLanguage(language)
      const codeContent = String(children).replace(/\n$/, "")

      return (
        <ShikiCodeBlock language={validLanguage} {...props}>
          {codeContent}
        </ShikiCodeBlock>
      )
    },
    pre: ({ children, ...props }) => {
      // Prevent double wrapping of pre tags, Shiki handles this
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
    >
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
