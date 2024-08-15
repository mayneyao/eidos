import { AreaChart, PauseIcon, Play } from "lucide-react"
import Prism from "prismjs"

import { Button } from "@/components/ui/button"

import "prismjs/components/prism-sql"
import "prismjs/themes/prism-tomorrow.css"
import { useEffect, useRef } from "react"
import {
  DEFAULT_MARKDOWN_RENDERERS,
  Markdown,
  MarkdownRenderers,
} from "react-marked-renderer"

import { MentionComponent } from "../doc/nodes/MentionNode/MentionComponent"
import { useSpeak, useSpeakStore } from "./webspeech/hooks"

export const AIMessage = ({
  msgId: _msgId,
  message,
  prevMessage,
  onRun,
  msgIndex,
}: {
  msgId: string
  msgIndex: number
  message?: string
  prevMessage?: any
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
  const ref = useRef<HTMLDivElement>(null)
  const { msgId, charIndex, charLength } = useSpeakStore()
  const { cancel } = useSpeak()
  const hasRef = Boolean(prevMessage?.references)

  useEffect(() => {
    if (msgId === _msgId) {
      const el = ref.current
      if (el) {
        let textNode = el.querySelector("p")?.firstChild
        const range = document.createRange()
        const sel = window.getSelection()
        if (textNode) {
          try {
            range.setStart(textNode, charIndex)
            range.setEnd(textNode, charIndex + charLength)
          } catch (error) {}

          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }
    } else {
      const el = ref.current
      if (el) {
        let textNode = el.querySelector("p")?.firstChild
        const sel = window.getSelection()
        if (textNode) {
          sel?.removeAllRanges()
        }
      }
    }
  }, [msgId, _msgId, msgIndex, charIndex, charLength])

  const createMermaidChart = (code: string) => {
    const event = new CustomEvent("createMermaidChart", {
      detail: code,
    })
    document.dispatchEvent(event)
  }
  const renderers: MarkdownRenderers = {
    ...DEFAULT_MARKDOWN_RENDERERS,
    codespan: function CodeSpan({ children }) {
      // just so it gets some prism styling
      return <code className="language-none">{children}</code>
    },
    codeblock: function Code(props) {
      const { lang = "sql", text } = props
      const grammar = Prism.languages[lang] ?? Prism.languages["sql"]
      const codeHtml = Prism.highlight(text, grammar, lang)
      // if it's a d3 codeblock, we need to render it differently
      if (lang === "js" && text.includes("d3.")) {
        return <div />
      }
      if (lang === "mermaid") {
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
              onClick={() => createMermaidChart(text)}
            >
              <AreaChart className="h-4 w-4" />
            </Button>
          </pre>
        )
      }
      return (
        <pre className="relative flex w-[calc(100%-24px)] rounded-sm bg-gray-700 p-2">
          <code
            className={`language-${lang} w-full overflow-x-auto`}
            dangerouslySetInnerHTML={{
              __html: codeHtml,
            }}
          ></code>
          {lang.toLowerCase() === "sql" && (
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
          )}
        </pre>
      )
    },
  }

  return (
    <div
      className="ai-chat-msg group prose relative grow dark:prose-invert"
      ref={ref}
    >
      {message && <Markdown markdown={message} renderers={renderers} />}
      {hasRef && (
        <div className="mb-4">
          <div className="m-1 border-b border-purple-300" />
          <div className="flex flex-col items-start">
            {prevMessage?.references.map((source: string) => (
              <MentionComponent id={source} key={source} disablePreview />
            ))}
          </div>
        </div>
      )}
      <div id={`chart-${msgIndex}`} />
      {_msgId === msgId && (
        <div className=" absolute bottom-0 right-0" onClick={cancel}>
          <PauseIcon />
        </div>
      )}
    </div>
  )
}
