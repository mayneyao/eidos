import { Play } from "lucide-react"
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
}: {
  message: string
  onRun: (sql: string) => void
}) => {
  const renderers: MarkdownRenderers = {
    ...DEFAULT_MARKDOWN_RENDERERS,
    codespan: function CodeSpan({ children }) {
      // just so it gets some prism styling
      return <code className="language-none">{children}</code>
    },
    codeblock: function Code(props) {
      const { lang, text } = props
      const codeHtml = Prism.highlight(text, Prism.languages[lang], lang)
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
            onClick={() => onRun(text)}
          >
            <Play className="h-4 w-4" />
          </Button>
        </pre>
      )
    },
  }
  return (
    <div className="grow">
      <Markdown markdown={message} renderers={renderers} />
    </div>
  )
}
