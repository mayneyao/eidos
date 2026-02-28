import { $convertToMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import * as prettier from "prettier/standalone"
import * as prettierMarkdown from "prettier/plugins/markdown"

import { useToast } from "@/components/ui/use-toast"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { formatFor, loadConfig, lintFor } from "@huacnlee/autocorrect"
import { useEditorInstance } from "../../hooks/editor-instance-context"
import { allTransformers } from "../const"

const autocorrect = {
  formatFor,
  lintFor,
  loadConfig,
}

export let config = {
  rules: {
    spellcheck: 2,
  },
  spellcheck: {
    words: ["WebAssembly", "Rust", "NPM", "Web", "JavaScript"],
  },
}

export function PrettierPlugin() {
  const [editor] = useLexicalComposerContext()
  const { sqlite } = useSqlite()
  const { toast } = useToast()
  const { docId } = useEditorInstance()
  const { t } = useTranslation()

  const formatMarkdown = useCallback(
    async (markdown: string) => {
      try {
        // const prettierFormatted = await prettier.format(markdown, {
        //   parser: 'markdown',
        //   plugins: [prettierMarkdown],
        //   printWidth: 80,
        //   tabWidth: 2,
        //   useTabs: false,
        //   semi: false,
        //   singleQuote: true,
        //   quoteProps: 'as-needed',
        //   trailingComma: 'es5',
        //   bracketSpacing: true,
        //   arrowParens: 'avoid',
        //   proseWrap: 'preserve',
        //   htmlWhitespaceSensitivity: 'ignore',
        //   embeddedLanguageFormatting: 'off',
        // })
        const result = autocorrect.formatFor(markdown, "markdown")
        return result.out
      } catch (error) {
        throw error
      }
    },
    [autocorrect]
  )

  const handleFormat = useCallback(async () => {
    if (!editor.isEditable() || !docId) {
      return
    }

    try {
      let markdown = ""

      editor.getEditorState().read(() => {
        markdown = $convertToMarkdownString(allTransformers, undefined, true)
      })

      if (!markdown.trim()) {
        return
      }

      const formattedMarkdown = await formatMarkdown(markdown)
      console.log(formattedMarkdown)

      if (formattedMarkdown === markdown) {
        return
      }

      const res = await sqlite?.doc.createOrUpdate({
        id: docId,
        text: formattedMarkdown,
        type: "markdown",
        mode: "replace",
      })

      if (res?.success) {
        window.dispatchEvent(
          new CustomEvent("eidos-doc-refresh", {
            detail: { docId },
          })
        )
      } else {
        toast({
          title: t("doc.prettier.formatFailed"),
          description: t("doc.prettier.saveFailed"),
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: t("doc.prettier.formatFailed"),
        description:
          error instanceof Error
            ? error.message
            : t("doc.prettier.unknownError"),
        variant: "destructive",
      })
    }
  }, [editor, sqlite, docId, toast, formatMarkdown, autocorrect, t])

  useKeyPress(
    ["shift.alt.f"],
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log("shift.option.f")
      handleFormat()
    },
    {
      useCapture: true,
    }
  )

  return null
}
