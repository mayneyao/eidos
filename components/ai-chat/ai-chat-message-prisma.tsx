import { Play } from "lucide-react"

import "./prism-config"
import Prism from "prismjs"

import { Button } from "@/components/ui/button"

import "prismjs/components/prism-sql"
import "prismjs/themes/prism-tomorrow.css"
import {
  DEFAULT_MARKDOWN_RENDERERS,
  Markdown,
  MarkdownRenderers,
} from "react-marked-renderer"

export const AIMessage = ({
  message,
  onRun,
  msgIndex,
}: {
  msgIndex: number
  message?: string
  onRun: (props: {
    code: string
    lang: string
    isAuto: boolean
    context?: {
      msgIndex: number
      width: number
    }
  }) => void
}) => {
  const renderers: MarkdownRenderers = {
    ...DEFAULT_MARKDOWN_RENDERERS,
    codespan: function CodeSpan({ children }) {
      // just so it gets some prism styling
      return <code className="language-none">{children}</code>
    },
    codeblock: function Code(props) {
      const { lang = "sql", text } = props
      const codeHtml = Prism.highlight(text, Prism.languages[lang], lang)
      // if it's a d3 codeblock, we need to render it differently
      if (lang === "js" && text.includes("d3.")) {
        return <div />
      }
      return (
        <pre className="relative flex w-[calc(100%-24px)] rounded-sm bg-gray-700 p-2">
          <code
            className={`language-${lang} w-full overflow-x-auto`}
            dangerouslySetInnerHTML={{
              __html: codeHtml,
            }}
          ></code>
          <Button
            className=" absolute right-0 top-0 text-gray-300"
            variant="ghost"
            onClick={() =>
              onRun({
                code: text,
                lang,
                isAuto: false,
              })
            }
          >
            <Play className="h-4 w-4" />
          </Button>
        </pre>
      )
    },
  }
  return (
    <div className="prose grow dark:prose-invert">
      {message && <Markdown markdown={message} renderers={renderers} />}
      <div id={`chart-${msgIndex}`} />
    </div>
  )
}
